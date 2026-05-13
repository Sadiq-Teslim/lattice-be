from pydantic import BaseModel, Field


class DemoSeedRequest(BaseModel):
    count: int = Field(default=1000, ge=100, le=10000)
    ghost_count: int = Field(default=50, ge=1, le=1000)
    seed: int = Field(default=42, ge=1)
    ministry: str = "Lagos State Ministry of Education"


class DemoSeedResponse(BaseModel):
    pay_cycle_id: str
    ministry: str
    workers_inserted: int
    injected_ghost_workers: int


class AnomalySummary(BaseModel):
    scanned_workers: int
    flagged_workers: int
    injected_ghost_workers: int | None = None
    injected_ghosts_flagged: int | None = None
    recall_on_injected_ghosts: float | None = None
    true_positives: int | None = None
    false_positives: int | None = None
    true_negatives: int | None = None
    false_negatives: int | None = None
    precision: float | None = None
    recall: float | None = None
    f1_score: float | None = None
    false_positive_rate: float | None = None


class FeatureContributionItem(BaseModel):
    feature: str
    value: float
    baseline: float
    contribution: float
    direction: str


class AnomalyResultItem(BaseModel):
    worker_code: str
    anomaly_score: float
    flagged: bool
    explanations: list[str]
    feature_contributions: list[FeatureContributionItem] = []
    explanation_method: str | None = None
    is_injected_ghost: bool | None = None


class AnomalyScanResponse(BaseModel):
    pay_cycle_id: str
    summary: AnomalySummary
    results: list[AnomalyResultItem]
