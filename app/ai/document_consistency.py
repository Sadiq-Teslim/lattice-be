from collections import Counter
from datetime import date

from app.schemas.document_consistency import (
    DocumentConsistencyRequest,
    StaffDocumentRecord,
)

MIN_EMPLOYMENT_AGE = 16
MAX_EMPLOYMENT_AGE = 70
RETIREMENT_AGE = 65


def evaluate_document_consistency(payload: DocumentConsistencyRequest) -> dict:
    flags: list[dict] = []
    duplicate_numbers = _duplicate_document_numbers(payload.cohort_records)

    for record in [payload.worker_record, *payload.cohort_records]:
        if record.worker_id != payload.worker_record.worker_id:
            continue
        flags.extend(_evaluate_record(record, duplicate_numbers))

    severity = _highest_severity(flags)
    status = "DOCUMENT_INCONSISTENCY" if flags else "DOCUMENTS_CLEAN"
    return {
        "status": status,
        "severity": severity,
        "flags": flags,
        "summary": _summary(flags),
    }


def _evaluate_record(record: StaffDocumentRecord, duplicate_numbers: set[str]) -> list[dict]:
    flags: list[dict] = []

    if record.payroll_dob and record.bvn_dob and record.payroll_dob != record.bvn_dob:
        flags.append(
            _flag(
                code="DOB_MISMATCH",
                severity="HIGH",
                message="Payroll date of birth does not match BVN date of birth",
                fields=["payroll_dob", "bvn_dob"],
            )
        )

    if record.file_dob and record.payroll_dob and record.file_dob != record.payroll_dob:
        flags.append(
            _flag(
                code="FILE_DOB_MISMATCH",
                severity="MEDIUM",
                message="Staff file date of birth does not match payroll date of birth",
                fields=["file_dob", "payroll_dob"],
            )
        )

    if record.appointment_date and record.payroll_dob:
        age = _age_on(record.payroll_dob, record.appointment_date)
        if age < MIN_EMPLOYMENT_AGE:
            flags.append(
                _flag(
                    code="UNDERAGE_AT_EMPLOYMENT",
                    severity="HIGH",
                    message=f"Worker was {age} at appointment date",
                    fields=["payroll_dob", "appointment_date"],
                )
            )
        if age > MAX_EMPLOYMENT_AGE:
            flags.append(
                _flag(
                    code="OVERAGE_AT_EMPLOYMENT",
                    severity="HIGH",
                    message=f"Worker was {age} at appointment date",
                    fields=["payroll_dob", "appointment_date"],
                )
            )

    if record.first_salary_date and record.appointment_date:
        if record.first_salary_date < record.appointment_date:
            flags.append(
                _flag(
                    code="SALARY_BEFORE_APPOINTMENT",
                    severity="HIGH",
                    message="First salary date is before appointment date",
                    fields=["first_salary_date", "appointment_date"],
                )
            )

    if record.confirmation_date and record.appointment_date:
        if record.confirmation_date < record.appointment_date:
            flags.append(
                _flag(
                    code="CONFIRMATION_BEFORE_APPOINTMENT",
                    severity="HIGH",
                    message="Confirmation date is before appointment date",
                    fields=["confirmation_date", "appointment_date"],
                )
            )

    if record.last_promotion_date and record.appointment_date:
        if record.last_promotion_date < record.appointment_date:
            flags.append(
                _flag(
                    code="PROMOTION_BEFORE_APPOINTMENT",
                    severity="HIGH",
                    message="Promotion date is before appointment date",
                    fields=["last_promotion_date", "appointment_date"],
                )
            )

    if record.retirement_date and record.payroll_dob:
        retirement_age = _age_on(record.payroll_dob, record.retirement_date)
        if retirement_age > RETIREMENT_AGE + 5:
            flags.append(
                _flag(
                    code="RETIREMENT_DATE_ANOMALY",
                    severity="MEDIUM",
                    message=f"Retirement date implies retirement age of {retirement_age}",
                    fields=["retirement_date", "payroll_dob"],
                )
            )

    for name, number in record.document_numbers.items():
        if not number:
            continue
        if number in duplicate_numbers:
            flags.append(
                _flag(
                    code="DUPLICATE_DOCUMENT_NUMBER",
                    severity="HIGH",
                    message=f"{name} document number appears on multiple staff records",
                    fields=[f"document_numbers.{name}"],
                )
            )

    missing_docs = sorted(set(record.required_documents) - set(record.submitted_documents))
    for document in missing_docs:
        flags.append(
            _flag(
                code="MISSING_REQUIRED_DOCUMENT",
                severity="MEDIUM",
                message=f"Missing required document: {document}",
                fields=["submitted_documents"],
            )
        )

    return flags


def _duplicate_document_numbers(records: list[StaffDocumentRecord]) -> set[str]:
    values = [
        value
        for record in records
        for value in record.document_numbers.values()
        if value
    ]
    counts = Counter(values)
    return {value for value, count in counts.items() if count > 1}


def _age_on(dob: date, event_date: date) -> int:
    return (
        event_date.year
        - dob.year
        - ((event_date.month, event_date.day) < (dob.month, dob.day))
    )


def _flag(*, code: str, severity: str, message: str, fields: list[str]) -> dict:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "fields": fields,
    }


def _highest_severity(flags: list[dict]) -> str:
    if any(flag["severity"] == "HIGH" for flag in flags):
        return "HIGH"
    if any(flag["severity"] == "MEDIUM" for flag in flags):
        return "MEDIUM"
    if flags:
        return "LOW"
    return "NONE"


def _summary(flags: list[dict]) -> str:
    if not flags:
        return "No document inconsistencies detected"
    high = sum(1 for flag in flags if flag["severity"] == "HIGH")
    medium = sum(1 for flag in flags if flag["severity"] == "MEDIUM")
    low = sum(1 for flag in flags if flag["severity"] == "LOW")
    return f"{len(flags)} issue(s): {high} high, {medium} medium, {low} low"

