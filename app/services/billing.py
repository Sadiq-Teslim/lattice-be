from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import BillingAccount, CreditLedgerEntry, CreditPurchase
from app.schemas.billing import CreditPurchaseCreateRequest
from app.services.squad import SquadService
from app.services.webhooks import extract_transaction_reference, webhook_is_successful


class BillingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_or_create_account_for_key(self, api_key: str | None) -> BillingAccount:
        key = (api_key or settings.lattice_api_key or "local-demo-key").strip()
        account = self.db.query(BillingAccount).filter(BillingAccount.api_key == key).one_or_none()
        if account is not None:
            return account

        account = BillingAccount(
            name="Ogun State Ministry of Education",
            email=settings.demo_teslim_email,
            api_key=key,
            credit_balance=0,
        )
        self.db.add(account)
        self.db.flush()
        if settings.default_account_initial_credits > 0:
            self._add_ledger_entry(
                account=account,
                delta=settings.default_account_initial_credits,
                reason="STARTER_CREDIT",
                reference="starter",
                payload={"source": "default_account_initial_credits"},
            )
        self.db.commit()
        self.db.refresh(account)
        return account

    def create_credit_purchase(
        self,
        *,
        account: BillingAccount,
        payload: CreditPurchaseCreateRequest,
    ) -> CreditPurchase:
        amount_naira = Decimal(payload.credits * settings.credit_price_naira)
        transaction_reference = f"LTC-{uuid4().hex[:18].upper()}"
        purchase = CreditPurchase(
            account_id=account.id,
            credits=payload.credits,
            amount_naira=amount_naira,
            transaction_reference=transaction_reference,
            status="PENDING",
        )
        self.db.add(purchase)
        self.db.flush()

        squad_response = SquadService().initiate_payment(
            email=payload.email,
            amount_naira=amount_naira,
            customer_name=payload.customer_name,
            transaction_ref=transaction_reference,
            callback_url=f"{settings.public_lattice_url.rstrip('/')}/get-started?billing_ref={transaction_reference}",
            metadata={
                "product": "lattice_credits",
                "account_id": account.id,
                "credits": payload.credits,
            },
        )
        purchase.squad_response = squad_response
        purchase.checkout_url = _checkout_url_from_squad(squad_response)
        self.db.commit()
        self.db.refresh(purchase)
        return purchase

    def list_purchases(self, *, account: BillingAccount, limit: int = 20) -> list[CreditPurchase]:
        return (
            self.db.query(CreditPurchase)
            .filter(CreditPurchase.account_id == account.id)
            .order_by(CreditPurchase.created_at.desc())
            .limit(limit)
            .all()
        )

    def list_ledger(self, *, account: BillingAccount, limit: int = 20) -> list[CreditLedgerEntry]:
        return (
            self.db.query(CreditLedgerEntry)
            .filter(CreditLedgerEntry.account_id == account.id)
            .order_by(CreditLedgerEntry.created_at.desc())
            .limit(limit)
            .all()
        )

    def debit_verification_credit(
        self,
        *,
        account: BillingAccount,
        reference: str,
        payload: dict[str, Any],
    ) -> BillingAccount:
        self.db.refresh(account)
        self.assert_has_verification_credit(account)
        self._add_ledger_entry(
            account=account,
            delta=-1,
            reason="VERIFICATION_USAGE",
            reference=reference,
            payload=payload,
        )
        self.db.commit()
        self.db.refresh(account)
        return account

    def assert_has_verification_credit(self, account: BillingAccount) -> None:
        if settings.billing_enforce_credits and account.credit_balance < 1:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="insufficient Lattice credits. Buy credits before running verification.",
            )

    def apply_squad_webhook(self, payload: dict[str, Any]) -> CreditPurchase | None:
        transaction_reference = extract_transaction_reference(payload)
        if not transaction_reference:
            return None
        purchase = (
            self.db.query(CreditPurchase)
            .filter(CreditPurchase.transaction_reference == str(transaction_reference))
            .one_or_none()
        )
        if purchase is None:
            return None

        purchase.squad_response = payload
        if webhook_is_successful(payload) and purchase.status != "PAID":
            account = self.db.get(BillingAccount, purchase.account_id)
            if account is None:
                return None
            purchase.status = "PAID"
            purchase.paid_at = datetime.utcnow()
            self._add_ledger_entry(
                account=account,
                delta=purchase.credits,
                reason="SQUAD_CREDIT_PURCHASE",
                reference=purchase.transaction_reference,
                payload={"purchase_id": purchase.id, "squad_webhook": payload},
            )
        elif purchase.status != "PAID":
            purchase.status = "WEBHOOK_RECEIVED"
        self.db.commit()
        self.db.refresh(purchase)
        return purchase

    def _add_ledger_entry(
        self,
        *,
        account: BillingAccount,
        delta: int,
        reason: str,
        reference: str | None,
        payload: dict[str, Any],
    ) -> CreditLedgerEntry:
        account.credit_balance += delta
        entry = CreditLedgerEntry(
            account_id=account.id,
            delta=delta,
            balance_after=account.credit_balance,
            reason=reason,
            reference=reference,
            payload=payload,
        )
        self.db.add(entry)
        return entry


def _checkout_url_from_squad(response: dict[str, Any]) -> str | None:
    data = response.get("data") if isinstance(response.get("data"), dict) else {}
    for key in ("checkout_url", "checkoutUrl", "payment_url", "paymentUrl", "authorization_url"):
        value = data.get(key) or response.get(key)
        if value:
            return str(value)
    return None
