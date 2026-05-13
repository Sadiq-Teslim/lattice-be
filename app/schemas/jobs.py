from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.sdk import VerifyAndDisburseRequest


class JobResponse(BaseModel):
    id: str
    kind: str
    status: str
    payload: dict[str, Any]
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class EnqueueSDKVerificationRequest(BaseModel):
    request: VerifyAndDisburseRequest


class EnqueueJobResponse(BaseModel):
    job_id: str
    status: str
