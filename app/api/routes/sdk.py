from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_lattice_api_key
from app.db.session import get_db
from app.schemas.sdk import VerifyAndDisburseRequest, VerifyAndDisburseResponse
from app.services.sdk import SDKService

router = APIRouter(
    prefix="/sdk",
    tags=["sdk"],
    dependencies=[Depends(require_lattice_api_key)],
)
db_session = Depends(get_db)


@router.post("/verify-and-disburse", response_model=VerifyAndDisburseResponse)
def verify_and_disburse(
    payload: VerifyAndDisburseRequest,
    db: Session = db_session,
) -> VerifyAndDisburseResponse:
    return VerifyAndDisburseResponse(**SDKService(db).verify_and_disburse(payload))
