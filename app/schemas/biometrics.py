from typing import Literal

from pydantic import BaseModel, Field

BiometricModality = Literal["face", "fingerprint", "iris", "voice"]


class BiometricTemplate(BaseModel):
    modality: BiometricModality = "face"
    vector: list[float] = Field(min_length=8)
    provider: str | None = None
    captured_at: str | None = None
    metadata: dict = Field(default_factory=dict)


class BiometricEnrollRequest(BaseModel):
    template: BiometricTemplate


class BiometricCompareRequest(BaseModel):
    enrolled_template: BiometricTemplate
    captured_template: BiometricTemplate
    threshold: float = Field(default=0.86, ge=0, le=1)


class BiometricWorkerVerifyRequest(BaseModel):
    captured_template: BiometricTemplate
    threshold: float = Field(default=0.86, ge=0, le=1)


class BiometricVerifyResponse(BaseModel):
    status: Literal["BIOMETRIC_MATCH", "BIOMETRIC_MISMATCH"]
    similarity: float
    threshold: float
    modality: BiometricModality
    model_name: str
    model_version: str
    enrolled_quality: dict
    captured_quality: dict
    worker_id: str | None = None
    reference_source: str
