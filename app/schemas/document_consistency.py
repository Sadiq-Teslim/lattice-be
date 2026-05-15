from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class StaffDocumentRecord(BaseModel):
    worker_id: str
    full_name: str
    payroll_dob: date | None = None
    bvn_dob: date | None = None
    file_dob: date | None = None
    appointment_date: date | None = None
    first_salary_date: date | None = None
    confirmation_date: date | None = None
    last_promotion_date: date | None = None
    retirement_date: date | None = None
    document_numbers: dict[str, str] = Field(default_factory=dict)
    required_documents: list[str] = Field(default_factory=list)
    submitted_documents: list[str] = Field(default_factory=list)

    @field_validator(
        "payroll_dob",
        "bvn_dob",
        "file_dob",
        "appointment_date",
        "first_salary_date",
        "confirmation_date",
        "last_promotion_date",
        "retirement_date",
        mode="before",
    )
    @classmethod
    def parse_flexible_date(cls, value: object) -> date | None:
        if value in (None, ""):
            return None
        if isinstance(value, date):
            return value
        if not isinstance(value, str):
            return None

        normalized = value.strip()
        if not normalized:
            return None

        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(normalized[:10], fmt).date()
            except ValueError:
                continue

        try:
            return datetime.fromisoformat(normalized.replace("Z", "+00:00")).date()
        except ValueError:
            return None


class DocumentConsistencyRequest(BaseModel):
    worker_record: StaffDocumentRecord
    cohort_records: list[StaffDocumentRecord] = Field(default_factory=list)


class DocumentConsistencyFlag(BaseModel):
    code: str
    severity: str
    message: str
    fields: list[str]


class DocumentConsistencyResponse(BaseModel):
    status: str
    severity: str
    flags: list[DocumentConsistencyFlag]
    summary: str
