from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.scoring import PASS
from app.core.security import sign_payload
from app.db.models import VIQ, AuditLog
from app.services.squad import (
    SquadAPIError,
    SquadConfigurationError,
    SquadService,
    squad_error_to_http,
)


class PaymentService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def initiate_viq_transfer(
        self,
        *,
        viq_id: str,
        bank_code: str | None = None,
        account_number: str | None = None,
        account_name: str | None = None,
        amount_naira: Decimal | None = None,
        remark: str | None = None,
    ) -> tuple[VIQ, dict[str, Any]]:
        viq = self.db.get(VIQ, viq_id)
        if viq is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VIQ not found")
        if viq.verdict != PASS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"payment blocked because VIQ verdict is {viq.verdict}",
            )
        if viq.squad_transaction_reference:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="payment already initiated for this VIQ",
            )

        worker = viq.worker
        resolved_bank_code = bank_code or worker.bank_code
        resolved_account_number = account_number or worker.bank_account_number
        resolved_amount = amount_naira or worker.salary_amount

        if not resolved_bank_code or not resolved_account_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="bank_code and account_number are required before transfer",
            )

        try:
            squad = SquadService()
            lookup_response = squad.account_lookup(
                bank_code=resolved_bank_code,
                account_number=resolved_account_number,
            )
            looked_up_name = str(lookup_response.get("data", {}).get("account_name") or "")
            resolved_account_name = account_name or worker.bank_account_name or looked_up_name
            if not resolved_account_name:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="account_name is required and Squad account lookup returned no name",
                )

            transaction_reference = f"LTA-{viq.id[:8]}"
            transfer_response = squad.initiate_transfer(
                amount_naira=resolved_amount,
                bank_code=resolved_bank_code,
                account_number=resolved_account_number,
                account_name=resolved_account_name,
                transaction_reference=transaction_reference,
                remark=remark or f"Lattice salary release for {worker.worker_code}",
            )
        except (SquadConfigurationError, SquadAPIError) as exc:
            raise squad_error_to_http(exc) from exc

        scoped_reference = transfer_response.get("data", {}).get("transaction_reference")
        if not scoped_reference:
            scoped_reference = squad._merchant_scoped_reference(transaction_reference)

        viq.squad_transaction_reference = scoped_reference
        viq.payment_status = "TRANSFER_INITIATED"
        viq.signed_payload = {
            **viq.signed_payload,
            "squad_transaction_reference": scoped_reference,
            "payment_status": viq.payment_status,
            "payment_provider": "SQUAD",
        }
        viq.signature = sign_payload(viq.signed_payload, settings.viq_signing_secret)

        self.db.add(
            AuditLog(
                worker_id=viq.worker_id,
                pay_cycle_id=viq.pay_cycle_id,
                event_type="SQUAD_TRANSFER_INITIATED",
                payload={
                    "viq_id": viq.id,
                    "transaction_reference": scoped_reference,
                    "amount_naira": str(resolved_amount),
                    "bank_code": resolved_bank_code,
                    "account_number": resolved_account_number,
                    "squad_response": transfer_response,
                },
            )
        )
        self.db.commit()
        self.db.refresh(viq)
        return viq, transfer_response
