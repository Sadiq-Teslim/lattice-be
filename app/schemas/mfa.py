from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SendOtpRequest(BaseModel):
    worker_id: str
    pay_cycle_id: str | None = None
    purpose: str = "PAYROLL_VERIFICATION"


class SendOtpResponse(BaseModel):
    challenge_id: str
    worker_id: str
    phone: str
    status: str
    expires_at: datetime
    provider_response: dict[str, Any]


class VerifyOtpRequest(BaseModel):
    challenge_id: str
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyOtpResponse(BaseModel):
    challenge_id: str
    status: str
    attempts: int
    verified: bool
