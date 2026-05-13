from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_lattice_api_key
from app.db.session import get_db
from app.schemas.mfa import SendOtpRequest, SendOtpResponse, VerifyOtpRequest, VerifyOtpResponse
from app.services.otp import OTPService

router = APIRouter(
    prefix="/mfa",
    tags=["mfa"],
    dependencies=[Depends(require_lattice_api_key)],
)
db_session = Depends(get_db)


@router.post("/otp/send", response_model=SendOtpResponse)
def send_otp(payload: SendOtpRequest, db: Session = db_session) -> SendOtpResponse:
    challenge = OTPService(db).send_worker_otp(
        worker_id=payload.worker_id,
        pay_cycle_id=payload.pay_cycle_id,
        purpose=payload.purpose,
    )
    return SendOtpResponse(
        challenge_id=challenge.id,
        worker_id=challenge.worker_id,
        phone=challenge.phone,
        status=challenge.status,
        expires_at=challenge.expires_at,
        provider_response=challenge.provider_response or {},
    )


@router.post("/otp/verify", response_model=VerifyOtpResponse)
def verify_otp(payload: VerifyOtpRequest, db: Session = db_session) -> VerifyOtpResponse:
    challenge = OTPService(db).verify_otp(challenge_id=payload.challenge_id, otp=payload.otp)
    return VerifyOtpResponse(
        challenge_id=challenge.id,
        status=challenge.status,
        attempts=challenge.attempts,
        verified=challenge.status == "VERIFIED",
    )
