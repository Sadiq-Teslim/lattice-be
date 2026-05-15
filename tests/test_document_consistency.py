from app.ai.document_consistency import evaluate_document_consistency
from app.schemas.document_consistency import DocumentConsistencyRequest, StaffDocumentRecord


def test_clean_document_record_passes() -> None:
    payload = DocumentConsistencyRequest(
        worker_record=StaffDocumentRecord(
            worker_id="W1",
            full_name="Adebayo Adeyemi",
            payroll_dob="1988-04-12",
            bvn_dob="1988-04-12",
            appointment_date="2014-09-01",
            first_salary_date="2014-09-30",
            required_documents=["appointment_letter", "birth_certificate"],
            submitted_documents=["appointment_letter", "birth_certificate"],
        )
    )

    result = evaluate_document_consistency(payload)

    assert result["status"] == "DOCUMENTS_CLEAN"
    assert result["severity"] == "NONE"
    assert result["flags"] == []


def test_document_record_accepts_common_date_formats() -> None:
    payload = DocumentConsistencyRequest(
        worker_record=StaffDocumentRecord(
            worker_id="W1",
            full_name="Adebayo Adeyemi",
            payroll_dob="07/19/1990",
            bvn_dob="1990-07-19",
            file_dob="1990-07-19T00:00:00Z",
            appointment_date="2014-09-01",
            first_salary_date="2014-09-30",
        )
    )

    result = evaluate_document_consistency(payload)

    assert result["status"] == "DOCUMENTS_CLEAN"


def test_date_contradictions_are_flagged() -> None:
    payload = DocumentConsistencyRequest(
        worker_record=StaffDocumentRecord(
            worker_id="W1",
            full_name="Adebayo Adeyemi",
            payroll_dob="2010-01-01",
            bvn_dob="1988-04-12",
            appointment_date="2020-01-01",
            first_salary_date="2019-12-01",
            confirmation_date="2019-01-01",
            last_promotion_date="2018-01-01",
        )
    )

    result = evaluate_document_consistency(payload)
    codes = {flag["code"] for flag in result["flags"]}

    assert result["status"] == "DOCUMENT_INCONSISTENCY"
    assert "DOB_MISMATCH" in codes
    assert "UNDERAGE_AT_EMPLOYMENT" in codes
    assert "SALARY_BEFORE_APPOINTMENT" in codes
    assert "CONFIRMATION_BEFORE_APPOINTMENT" in codes
    assert "PROMOTION_BEFORE_APPOINTMENT" in codes


def test_missing_documents_and_duplicate_numbers_are_flagged() -> None:
    worker = StaffDocumentRecord(
        worker_id="W1",
        full_name="Adebayo Adeyemi",
        payroll_dob="1988-04-12",
        appointment_date="2014-09-01",
        document_numbers={"appointment_letter": "DOC-123"},
        required_documents=["appointment_letter", "birth_certificate"],
        submitted_documents=["appointment_letter"],
    )
    payload = DocumentConsistencyRequest(
        worker_record=worker,
        cohort_records=[
            worker,
            StaffDocumentRecord(
                worker_id="W2",
                full_name="Kemi Bello",
                document_numbers={"appointment_letter": "DOC-123"},
            ),
        ],
    )

    result = evaluate_document_consistency(payload)
    codes = {flag["code"] for flag in result["flags"]}

    assert "MISSING_REQUIRED_DOCUMENT" in codes
    assert "DUPLICATE_DOCUMENT_NUMBER" in codes
