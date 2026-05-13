import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Protocol

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AuditLog, OtpChallenge, Worker
from app.services.squad import SquadAPIError, SquadConfigurationError, SquadService


class SmsSender(Protocol):
    def send_sms(self, *, phone: str, message: str, sender_id: str | None = None) -> dict:
        raise NotImplementedError


class OTPService:
    def __init__(self, db: Session, sms_sender: SmsSender | None = None) -> None:
        self.db = db
        self.sms_sender = sms_sender or SquadService()

    def send_worker_otp(
        self,
        *,
        worker_id: str,
        pay_cycle_id: str | None = None,
        purpose: str = "PAYROLL_VERIFICATION",
    ) -> OtpChallenge:
        worker = self.db.get(Worker, worker_id)
        if worker is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="worker not found")

        otp = _generate_otp()
        expires_at = datetime.utcnow() + timedelta(seconds=settings.otp_ttl_seconds)
        message = (
            f"Your Lattice verification OTP is {otp}. "
            f"It expires in {settings.otp_ttl_seconds // 60 or 1} minute(s)."
        )

        try:
            provider_response = self.sms_sender.send_sms(phone=worker.phone, message=message)
        except (SquadConfigurationError, SquadAPIError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "message": "Squad SMS send failed",
                    "reason": str(exc),
                    "provider_response": getattr(exc, "response", None),
                },
            ) from exc

        challenge = OtpChallenge(
            worker_id=worker.id,
            pay_cycle_id=pay_cycle_id,
            phone=worker.phone,
            purpose=purpose,
            otp_hash=_hash_otp(otp),
            expires_at=expires_at,
            provider_response=provider_response,
        )
        self.db.add(challenge)
        self.db.flush()
        self.db.add(
            AuditLog(
                worker_id=worker.id,
                pay_cycle_id=pay_cycle_id,
                event_type="OTP_SENT",
                payload={
                    "challenge_id": challenge.id,
                    "phone": _mask_phone(worker.phone),
                    "purpose": purpose,
                    "provider_response": provider_response,
                },
            )
        )
        self.db.commit()
        self.db.refresh(challenge)
        return challenge

    def verify_otp(self, *, challenge_id: str, otp: str) -> OtpChallenge:
        challenge = self.db.get(OtpChallenge, challenge_id)
        if challenge is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="OTP challenge not found",
            )

        if challenge.status == "VERIFIED":
            return challenge
        if challenge.status in {"EXPIRED", "LOCKED"}:
            return challenge

        now = datetime.utcnow()
        if now > challenge.expires_at:
            challenge.status = "EXPIRED"
            self.db.commit()
            self.db.refresh(challenge)
            return challenge

        challenge.attempts += 1
        if hmac.compare_digest(challenge.otp_hash, _hash_otp(otp)):
            challenge.status = "VERIFIED"
            challenge.verified_at = now
            event_type = "OTP_VERIFIED"
        elif challenge.attempts >= challenge.max_attempts:
            challenge.status = "LOCKED"
            event_type = "OTP_LOCKED"
        else:
            event_type = "OTP_VERIFY_FAILED"

        self.db.add(
            AuditLog(
                worker_id=challenge.worker_id,
                pay_cycle_id=challenge.pay_cycle_id,
                event_type=event_type,
                payload={
                    "challenge_id": challenge.id,
                    "attempts": challenge.attempts,
                    "status": challenge.status,
                },
            )
        )
        self.db.commit()
        self.db.refresh(challenge)
        return challenge


def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_otp(otp: str) -> str:
    return hmac.new(
        settings.viq_signing_secret.encode("utf-8"),
        otp.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _mask_phone(phone: str) -> str:
    if len(phone) <= 4:
        return "****"
    return f"{phone[:3]}****{phone[-3:]}"
