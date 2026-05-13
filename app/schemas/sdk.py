from pydantic import BaseModel

from app.schemas.pay_cycle import PayCycleCreateRequest, PayCycleResponse
from app.schemas.squad import InitiateVIQTransferRequest, InitiateVIQTransferResponse
from app.schemas.verification import VerificationEvidenceSubmitRequest, VIQResponse
from app.schemas.worker import WorkerCreateRequest, WorkerResponse


class VerifyAndDisburseRequest(BaseModel):
    worker_id: str | None = None
    worker: WorkerCreateRequest | None = None
    pay_cycle_id: str | None = None
    pay_cycle: PayCycleCreateRequest | None = None
    evidence: VerificationEvidenceSubmitRequest
    initiate_transfer: bool = False
    transfer: InitiateVIQTransferRequest | None = None


class VerifyAndDisburseResponse(BaseModel):
    worker: WorkerResponse
    pay_cycle: PayCycleResponse
    viq: VIQResponse
    payment_attempted: bool
    payment_blocked_reason: str | None = None
    transfer: InitiateVIQTransferResponse | None = None
