from decimal import Decimal

from app.api.routes.admin import (
    approve_payment,
    create_exercise,
    flag_investigation,
    publish_exercise,
)
from app.db.models import VIQ, PayCycle, VerificationSession, Worker
from app.schemas.admin import StaffActionRequest, VerificationExerciseCreateRequest


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
