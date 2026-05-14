from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StaffActionRequest(BaseModel):
    worker_id: str
    pay_cycle_id: str | None = None
    viq_id: str | None = None
    note: str | None = None
    actor: str = "HR Payroll Desk"
    payload: dict[str, Any] = Field(default_factory=dict)


class StaffActionResponse(BaseModel):
    id: str
    worker_id: str
    pay_cycle_id: str | None
    viq_id: str | None
    action_type: str
    status: str
    note: str | None
    actor: str
    payload: dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReleaseEligibleRequest(BaseModel):
    pay_cycle_id: str
    worker_ids: list[str] = Field(default_factory=list)
    actor: str = "HR Payroll Desk"


class ReleaseEligibleResponse(BaseModel):
    released: list[StaffActionResponse]
    skipped: list[dict[str, str]]


class VerificationExerciseCreateRequest(BaseModel):
    ministry: str
    name: str
    scope: str
    rules: list[str] = Field(default_factory=list)
    documents: list[str] = Field(default_factory=list)


class VerificationExerciseUpdateRequest(BaseModel):
    name: str | None = None
    scope: str | None = None
    rules: list[str] | None = None
    documents: list[str] | None = None


class VerificationExerciseResponse(BaseModel):
    id: str
    ministry: str
    name: str
    scope: str
    rules: list[str]
    documents: list[str]
    status: str
    public_token: str | None
    public_url: str | None
    created_at: datetime
    published_at: datetime | None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExerciseSubmissionCreateRequest(BaseModel):
    worker_id: str | None = None
    worker_code: str | None = None
    full_name: str
    document_status: str | None = None
    liveness_status: str | None = None
    decision: Literal["PASS", "REVIEW", "FAIL"] = "REVIEW"
    payload: dict[str, Any] = Field(default_factory=dict)


class ExerciseSubmissionResponse(BaseModel):
    id: str
    exercise_id: str
    worker_id: str | None
    worker_code: str | None
    full_name: str
    status: str
    decision: str
    document_status: str | None
    liveness_status: str | None
    payload: dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminSummaryResponse(BaseModel):
    ministry: str | None = None
    pay_cycle_id: str | None = None
    workers: int
    viqs: int
    pass_count: int
    review_count: int
    fail_count: int
    approved_count: int
    flagged_count: int
    held_count: int
    gross_payroll: str
    eligible_payroll: str
    held_payroll: str
