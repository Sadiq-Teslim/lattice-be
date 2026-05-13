from datetime import date

from pydantic import BaseModel, Field


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

