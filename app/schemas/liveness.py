from pydantic import BaseModel, Field


class LandmarkPoint(BaseModel):
    x: float
    y: float
    z: float | None = None


class LivenessChallengeResult(BaseModel):
    challenge: str = "blink_twice_turn_left"
    blink_count: int = Field(ge=0)
    head_turn_degrees: float
    confidence: float = Field(ge=0, le=1)
    attempts: int = Field(ge=1, le=10)
    captured_at: str | None = None
    device_id: str | None = None
    landmarks_sample: list[LandmarkPoint] | None = None


class LivenessEvaluationResponse(BaseModel):
    status: str
    confidence: float
    attempts: int
    challenge: str
    reasons: list[str]


class CachedLivenessPayload(BaseModel):
    cache_id: str
    payload_hash: str
    signature: str | None = None
    public_key_jwk: dict | None = None
    captured_at: str
    worker_id: str | None = None
    pay_cycle_id: str | None = None
    session_id: str | None = None
    payload: LivenessChallengeResult


class LivenessSyncRequest(BaseModel):
    records: list[CachedLivenessPayload]


class LivenessSyncItem(BaseModel):
    cache_id: str
    status: str
    confidence: float
    synced: bool
    signature_valid: bool
    reasons: list[str]


class LivenessSyncResponse(BaseModel):
    received: int
    synced: int
    results: list[LivenessSyncItem]
