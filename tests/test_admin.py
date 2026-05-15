from decimal import Decimal

from app.api.routes.admin import (
    approve_payment,
    create_exercise,
    create_public_exercise_submission,
    delete_exercise,
    flag_investigation,
    get_public_exercise,
    match_public_exercise_staff,
    publish_exercise,
)
from app.db.models import VIQ, PayCycle, VerificationSession, Worker
from app.schemas.admin import (
    ExerciseSubmissionCreateRequest,
    StaffActionRequest,
    VerificationExerciseCreateRequest,
)


def _verified_worker(db_session):
    worker = Worker(
        worker_code="ADM-001",
        full_name="Adebayo Adeyemi",
        bvn="12345678901",
        phone="08012345678",
        ministry="Ogun State Ministry of Education",
        salary_amount=Decimal("100000"),
    )
    pay_cycle = PayCycle(name="June 2026", ministry=worker.ministry, status="ACTIVE")
    db_session.add_all([worker, pay_cycle])
    db_session.flush()
    session = VerificationSession(
        worker_id=worker.id,
        pay_cycle_id=pay_cycle.id,
        session_token="admin-test-session",
        status="COMPLETED",
        evidence={},
    )
    db_session.add(session)
    db_session.flush()
    viq = VIQ(
        worker_id=worker.id,
        pay_cycle_id=pay_cycle.id,
        session_id=session.id,
        trust_score=96,
        verdict="PASS",
        flags=[],
        signed_payload={"worker_id": worker.id, "payment_status": "NOT_INITIATED"},
        signature="signature",
    )
    db_session.add(viq)
    db_session.commit()
    return worker, pay_cycle, viq


def test_admin_can_approve_passed_staff_payment(db_session) -> None:
    worker, pay_cycle, viq = _verified_worker(db_session)

    action = approve_payment(
        StaffActionRequest(worker_id=worker.id, pay_cycle_id=pay_cycle.id, viq_id=viq.id),
        db=db_session,
    )

    assert action.action_type == "APPROVE_PAYMENT"
    assert action.status == "APPROVED"
    assert viq.payment_status == "APPROVED_FOR_RELEASE"


def test_admin_can_flag_staff_for_investigation(db_session) -> None:
    worker, pay_cycle, viq = _verified_worker(db_session)

    action = flag_investigation(
        StaffActionRequest(worker_id=worker.id, pay_cycle_id=pay_cycle.id, viq_id=viq.id),
        db=db_session,
    )

    assert action.action_type == "FLAG_INVESTIGATION"
    assert action.status == "FLAGGED"
    assert viq.payment_status == "HELD_FOR_INVESTIGATION"


def test_admin_can_create_and_publish_verification_exercise(db_session) -> None:
    exercise = create_exercise(
        VerificationExerciseCreateRequest(
            ministry="Ogun State Ministry of Education",
            name="June 2026 Verification Exercise",
            scope="Teaching staff only",
            rules=["proof_of_life", "document_consistency"],
            documents=["Appointment letter", "Staff ID card"],
        ),
        db=db_session,
    )

    published = publish_exercise(exercise.id, db=db_session)

    assert published.status == "PUBLISHED"
    assert published.public_token
    assert published.public_url


def test_public_exercise_link_loads_and_accepts_submission(db_session) -> None:
    exercise = create_exercise(
        VerificationExerciseCreateRequest(
            ministry="Ogun State Ministry of Education",
            name="June 2026 Verification Exercise",
            scope="Teaching staff only",
            rules=["proof_of_life"],
            documents=["Staff ID card"],
        ),
        db=db_session,
    )
    published = publish_exercise(exercise.id, db=db_session)

    public = get_public_exercise(published.public_token, db=db_session)
    submission = create_public_exercise_submission(
        published.public_token,
        ExerciseSubmissionCreateRequest(
            worker_code="ADM-001",
            full_name="Adebayo Adeyemi",
            document_status="DOCUMENTS_SUBMITTED",
            liveness_status="PASSED",
            decision="PASS",
            payload={"documents_submitted": ["Staff ID card"]},
        ),
        db=db_session,
    )

    assert public.id == published.id
    assert submission.exercise_id == published.id
    assert submission.decision == "PASS"


def test_public_exercise_staff_match_correlates_identity(db_session) -> None:
    worker, _, _ = _verified_worker(db_session)
    worker.worker_code = "OG00001"
    worker.date_of_birth = "1998-01-01"
    db_session.commit()
    exercise = create_exercise(
        VerificationExerciseCreateRequest(
            ministry=worker.ministry,
            name="June 2026 Verification Exercise",
            scope="Teaching staff only",
            rules=["proof_of_life"],
            documents=["Staff ID card"],
        ),
        db=db_session,
    )
    published = publish_exercise(exercise.id, db=db_session)

    matched = match_public_exercise_staff(
        published.public_token,
        worker_code="OG00001",
        full_name="Adebayo Adeyemi",
        date_of_birth="1998-01-01",
        phone="08012345678",
        db=db_session,
    )

    assert matched["status"] == "MATCH"
    assert matched["checks"]["staff_id"] is True
    assert matched["checks"]["name"] is True


def test_admin_can_delete_verification_exercise_and_submissions(db_session) -> None:
    exercise = create_exercise(
        VerificationExerciseCreateRequest(
            ministry="Ogun State Ministry of Education",
            name="June 2026 Verification Exercise",
            scope="Teaching staff only",
            rules=["proof_of_life"],
            documents=["Staff ID card"],
        ),
        db=db_session,
    )
    published = publish_exercise(exercise.id, db=db_session)
    create_public_exercise_submission(
        published.public_token,
        ExerciseSubmissionCreateRequest(
            worker_code="ADM-001",
            full_name="Adebayo Adeyemi",
            document_status="DOCUMENTS_SUBMITTED",
            liveness_status="PASSED",
            decision="PASS",
            payload={"documents_submitted": ["Staff ID card"]},
        ),
        db=db_session,
    )

    delete_exercise(published.id, db=db_session)

    assert db_session.get(type(published), published.id) is None
