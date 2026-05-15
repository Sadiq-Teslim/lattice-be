from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class VerificationSessionCreateRequest(BaseModel):
    worker_id: str
    pay_cycle_id: str


class LivenessEvidence(BaseModel):
    status: Literal["PASSED", "FAILED", "LIVENESS_FAIL"]
    confidence: float | None = Field(default=None, ge=0, le=1)
    attempts: int = Field(default=1, ge=0, le=10)
    challenge: str | None = None
    captured_at: str | None = None


class DeepfakeEvidence(BaseModel):
    status: Literal["CLEAN", "DEEPFAKE_DETECTED"]
    synthetic_probability: float | None = Field(default=None, ge=0, le=1)
    model_name: str | None = None
    model_version: str | None = None
    captured_at: str | None = None


class FaceMatchEvidence(BaseModel):
    status: Literal["MATCH", "FACE_MISMATCH"]
    similarity: float | None = Field(default=None, ge=0, le=1)
    captured_at: str | None = None


class BvnEvidence(BaseModel):
    status: Literal["BVN_MATCH", "BVN_MISMATCH"]
    provider: Literal["SQUAD"]
    provider_reference: str | None = None
    resolved_name: str | None = None
    matched_name: str | None = None
    captured_at: str | None = None


class DocumentEvidence(BaseModel):
    status: Literal["DOCUMENTS_CLEAN", "DOCUMENT_INCONSISTENCY"]
    severity: Literal["NONE", "LOW", "MEDIUM", "HIGH"]
    flags: list[dict] = Field(default_factory=list)
    summary: str | None = None


class FinancialAccountEvidence(BaseModel):
    status: Literal["ACCOUNT_MATCH", "ACCOUNT_MISMATCH"]
    provider: Literal["SQUAD"]
    bank_code: str | None = None
    account_number: str | None = None
    resolved_name: str | None = None


class VerificationEvidenceSubmitRequest(BaseModel):
    liveness: LivenessEvidence | None = None
    deepfake: DeepfakeEvidence | None = None
    face_match: FaceMatchEvidence | None = None
    bvn: BvnEvidence | None = None
    documents: DocumentEvidence | None = None
    financial_account: FinancialAccountEvidence | None = None


class VerificationSessionResponse(BaseModel):
    id: str
    worker_id: str
    pay_cycle_id: str
    session_token: str
    status: str
    liveness_status: str | None
    deepfake_status: str | None
    anomaly_status: str | None
    bvn_status: str | None
    attempts: int
    evidence: dict[str, Any] | None

    model_config = ConfigDict(from_attributes=True)


class VIQResponse(BaseModel):
    id: str
    worker_id: str
    pay_cycle_id: str
    session_id: str
    trust_score: int
    verdict: str
    flags: list[str]
    signed_payload: dict[str, Any]
    signature: str
    squad_transaction_reference: str | None
    payment_status: str

    model_config = ConfigDict(from_attributes=True)


class VerificationFinalizeResponse(BaseModel):
    session: VerificationSessionResponse
    viq: VIQResponse


class PublicWorkerVerificationResponse(BaseModel):
    id: str
    worker_code: str
    full_name: str
    phone_last4: str
    ministry: str
    department: str | None
    date_of_birth: str | None
    salary_amount: str
    status: str


class PublicPayCycleResponse(BaseModel):
    id: str
    name: str
    ministry: str
    status: str


class PublicVerificationSessionResponse(BaseModel):
    session: VerificationSessionResponse
    worker: PublicWorkerVerificationResponse
    pay_cycle: PublicPayCycleResponse
    viq: VIQResponse | None = None


class PublicOtpSendResponse(BaseModel):
    challenge_id: str
    phone_last4: str
    status: str
    expires_at: str


class PublicOtpVerifyRequest(BaseModel):
    challenge_id: str
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class PublicOtpVerifyResponse(BaseModel):
    challenge_id: str
    status: str
    attempts: int
    verified: bool


class PublicDocumentUploadResponse(BaseModel):
    status: str
    severity: str
    flags: list[dict]
    summary: str
    submitted_documents: list[str]
    extracted_documents: list[dict]
    extracted_dates: list[str]
    text_excerpt: str | None = None


class PublicFaceVerificationResponse(BaseModel):
    status: str
    similarity: float
    threshold: float
    model_name: str
    model_version: str
    reference_source: str
    candidate_preprocessing: dict
