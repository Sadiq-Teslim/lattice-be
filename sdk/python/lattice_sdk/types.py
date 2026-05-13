from typing import Any, Literal, NotRequired, TypedDict


class LivenessEvidence(TypedDict, total=False):
    status: Literal["PASSED", "FAILED", "LIVENESS_FAIL"]
    confidence: float
    attempts: int
    challenge: str
    captured_at: str


class DeepfakeEvidence(TypedDict, total=False):
    status: Literal["CLEAN", "DEEPFAKE_DETECTED"]
    synthetic_probability: float
    model_name: str
    model_version: str
    captured_at: str


class FaceMatchEvidence(TypedDict, total=False):
    status: Literal["MATCH", "FACE_MISMATCH"]
    similarity: float
    captured_at: str


class BvnEvidence(TypedDict, total=False):
    status: Literal["BVN_MATCH", "BVN_MISMATCH"]
    provider: Literal["SQUAD"]
    provider_reference: str
    resolved_name: str
    matched_name: str
    captured_at: str


class DocumentEvidence(TypedDict, total=False):
    status: Literal["DOCUMENTS_CLEAN", "DOCUMENT_INCONSISTENCY"]
    severity: Literal["NONE", "LOW", "MEDIUM", "HIGH"]
    flags: list[dict[str, Any]]
    summary: str


class VerificationEvidence(TypedDict, total=False):
    liveness: LivenessEvidence
    deepfake: DeepfakeEvidence
    face_match: FaceMatchEvidence
    bvn: BvnEvidence
    documents: DocumentEvidence


class WorkerPayload(TypedDict, total=False):
    worker_code: str
    full_name: str
    bvn: str
    phone: str
    ministry: str
    salary_amount: int | float | str
    department: str
    email: str
    date_of_birth: str
    gender: str
    address: str
    device_id: str
    gps_lat: int | float | str
    gps_lng: int | float | str
    registration_ip: str
    registration_timestamp: str
    bank_code: str
    bank_account_number: str
    bank_account_name: str
    risk_metadata: dict[str, Any]


class PayCyclePayload(TypedDict):
    name: str
    ministry: str


class TransferPayload(TypedDict, total=False):
    viq_id: NotRequired[str]
    bank_code: str
    account_number: str
    account_name: str
    amount_naira: int | float | str
    remark: str
