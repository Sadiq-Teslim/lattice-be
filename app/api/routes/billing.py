from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_lattice_api_key
from app.core.config import settings
from app.db.models import BillingAccount
from app.db.session import get_db
from app.schemas.billing import (
    BillingAccountResponse,
    CreditLedgerEntryResponse,
    CreditPurchaseCreateRequest,
    CreditPurchaseResponse,
)
from app.services.billing import BillingService

router = APIRouter(prefix="/billing", tags=["billing"])
db_session = Depends(get_db)
api_key_dependency = Depends(require_lattice_api_key)


@router.get("/account", response_model=BillingAccountResponse)
def get_billing_account(
    api_key: str | None = api_key_dependency,
    db: Session = db_session,
) -> BillingAccountResponse:
    account = BillingService(db).get_or_create_account_for_key(api_key)
    return _account_response(account)


@router.get("/credit-purchases", response_model=list[CreditPurchaseResponse])
def list_credit_purchases(
    api_key: str | None = api_key_dependency,
    db: Session = db_session,
) -> list[CreditPurchaseResponse]:
    service = BillingService(db)
    account = service.get_or_create_account_for_key(api_key)
    return [CreditPurchaseResponse.model_validate(purchase, from_attributes=True) for purchase in service.list_purchases(account=account)]


@router.post("/credit-purchases", response_model=CreditPurchaseResponse)
def create_credit_purchase(
    payload: CreditPurchaseCreateRequest,
    api_key: str | None = api_key_dependency,
    db: Session = db_session,
) -> CreditPurchaseResponse:
    service = BillingService(db)
    account = service.get_or_create_account_for_key(api_key)
    purchase = service.create_credit_purchase(account=account, payload=payload)
    return CreditPurchaseResponse.model_validate(purchase, from_attributes=True)


@router.get("/ledger", response_model=list[CreditLedgerEntryResponse])
def list_credit_ledger(
    api_key: str | None = api_key_dependency,
    db: Session = db_session,
) -> list[CreditLedgerEntryResponse]:
    service = BillingService(db)
    account = service.get_or_create_account_for_key(api_key)
    return [CreditLedgerEntryResponse.model_validate(entry, from_attributes=True) for entry in service.list_ledger(account=account)]


def _account_response(account: BillingAccount) -> BillingAccountResponse:
    return BillingAccountResponse(
        id=account.id,
        name=account.name,
        email=account.email,
        api_key_last4=account.api_key[-4:],
        credit_balance=account.credit_balance,
        status=account.status,
        price_per_credit_naira=settings.credit_price_naira,
    )
