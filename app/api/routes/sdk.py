from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_lattice_api_key
from app.db.session import get_db
from app.schemas.sdk import VerifyAndDisburseRequest, VerifyAndDisburseResponse
from app.services.billing import BillingService
from app.services.sdk import SDKService

router = APIRouter(
    prefix="/sdk",
    tags=["sdk"],
)
db_session = Depends(get_db)
api_key_dependency = Depends(require_lattice_api_key)


@router.post("/verify-and-disburse", response_model=VerifyAndDisburseResponse)
def verify_and_disburse(
    payload: VerifyAndDisburseRequest,
    api_key: str | None = api_key_dependency,
    db: Session = db_session,
) -> VerifyAndDisburseResponse:
    billing_account = BillingService(db).get_or_create_account_for_key(api_key)
    return VerifyAndDisburseResponse(
        **SDKService(db).verify_and_disburse(payload, billing_account=billing_account)
    )
