from pydantic import BaseModel, Field

from app.schemas.liveness import LivenessChallengeResult


class BiasAuditCase(BaseModel):
    case_id: str
    group: str = Field(description="Fairness group label, e.g. Fitzpatrick IV")
    expected_live: bool
    liveness: LivenessChallengeResult


class BiasAuditRequest(BaseModel):
    cases: list[BiasAuditCase]


class BiasGroupMetrics(BaseModel):
    group: str
    cases: int
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int
    false_positive_rate: float | None
    false_negative_rate: float | None


class BiasAuditResponse(BaseModel):
    component: str
    groups: list[BiasGroupMetrics]
    max_fpr_gap: float | None
    max_fnr_gap: float | None
    threshold_met: bool
    notes: list[str]


class BiasAuditDemoRequest(BaseModel):
    live_cases_per_group: int = Field(default=40, ge=10, le=500)
    spoof_cases_per_group: int = Field(default=40, ge=10, le=500)
    seed: int = Field(default=42, ge=1)
