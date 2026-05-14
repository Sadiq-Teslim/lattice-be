import secrets
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.scoring import PASS
from app.core.security import sign_payload
from app.db.models import (
    VIQ,
    AuditLog,
    ExerciseSubmission,
    PayCycle,
    StaffAction,
    VerificationExercise,
    Worker,
)
from app.db.session import get_db
from app.schemas.admin import (
    AdminSummaryResponse,
    ExerciseSubmissionCreateRequest,
    ExerciseSubmissionResponse,
    ReleaseEligibleRequest,
    ReleaseEligibleResponse,
    StaffActionRequest,
    StaffActionResponse,
    VerificationExerciseCreateRequest,
    VerificationExerciseResponse,
    VerificationExerciseUpdateRequest,
)

router = APIRouter(prefix="/admin", tags=["admin"])
db_session = Depends(get_db)


@router.get("/staff-actions", response_model=list[StaffActionResponse])
def list_staff_actions(
    ministry: str | None = Query(default=None),
    pay_cycle_id: str | None = Query(default=None),
    worker_id: str | None = Query(default=None),
    action_type: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = db_session,
) -> list[StaffActionResponse]:
    query = db.query(StaffAction).order_by(StaffAction.created_at.desc())
    if ministry:
        query = query.join(Worker, Worker.id == StaffAction.worker_id).filter(
            Worker.ministry == ministry
        )
    if pay_cycle_id:
        query = query.filter(StaffAction.pay_cycle_id == pay_cycle_id)
    if worker_id:
        query = query.filter(StaffAction.worker_id == worker_id)
    if action_type:
        query = query.filter(StaffAction.action_type == action_type.upper())
    return query.limit(limit).all()


@router.post("/staff-actions/approve-payment", response_model=StaffActionResponse)
def approve_payment(payload: StaffActionRequest, db: Session = db_session) -> StaffActionResponse:
    worker = _worker(db, payload.worker_id)
    viq = _resolve_viq(
        db,
        worker_id=worker.id,
        pay_cycle_id=payload.pay_cycle_id,
        viq_id=payload.viq_id,
    )
    if viq is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="staff must be verified before payment can be approved",
        )
    if viq.verdict != PASS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"payment cannot be approved because VIQ verdict is {viq.verdict}",
        )
    if _latest_action(db, worker.id, viq.pay_cycle_id, "FLAG_INVESTIGATION") is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="staff is flagged for investigation",
        )

    viq.payment_status = "APPROVED_FOR_RELEASE"
    viq.signed_payload = {
        **viq.signed_payload,
        "payment_status": viq.payment_status,
        "approved_by": payload.actor,
    }
    viq.signature = sign_payload(viq.signed_payload, settings.viq_signing_secret)
    action = _record_action(
        db,
        worker=worker,
        pay_cycle_id=viq.pay_cycle_id,
        viq_id=viq.id,
        action_type="APPROVE_PAYMENT",
        status="APPROVED",
        note=payload.note,
        actor=payload.actor,
        payload={"payment_status": viq.payment_status, "trust_score": viq.trust_score},
    )
    db.commit()
    db.refresh(action)
    return action


@router.post("/staff-actions/flag-investigation", response_model=StaffActionResponse)
def flag_investigation(
    payload: StaffActionRequest,
    db: Session = db_session,
) -> StaffActionResponse:
    worker = _worker(db, payload.worker_id)
    viq = _resolve_viq(
        db,
        worker_id=worker.id,
        pay_cycle_id=payload.pay_cycle_id,
        viq_id=payload.viq_id,
    )
    if viq is not None:
        viq.payment_status = "HELD_FOR_INVESTIGATION"
        viq.signed_payload = {
            **viq.signed_payload,
            "payment_status": viq.payment_status,
            "flagged_by": payload.actor,
        }
        viq.signature = sign_payload(viq.signed_payload, settings.viq_signing_secret)
    action = _record_action(
        db,
        worker=worker,
        pay_cycle_id=payload.pay_cycle_id or (viq.pay_cycle_id if viq else None),
        viq_id=viq.id if viq else payload.viq_id,
        action_type="FLAG_INVESTIGATION",
        status="FLAGGED",
        note=payload.note,
        actor=payload.actor,
        payload={"payment_status": viq.payment_status if viq else "HELD_FOR_INVESTIGATION"},
    )
    db.commit()
    db.refresh(action)
    return action


@router.post("/staff-actions/document-check", response_model=StaffActionResponse)
def record_document_check(
    payload: StaffActionRequest,
    db: Session = db_session,
) -> StaffActionResponse:
    worker = _worker(db, payload.worker_id)
    action = _record_action(
        db,
        worker=worker,
        pay_cycle_id=payload.pay_cycle_id,
        viq_id=payload.viq_id,
        action_type="DOCUMENT_CHECK",
        status=str(payload.payload.get("status") or "CHECKED"),
        note=payload.note,
        actor=payload.actor,
        payload=payload.payload,
    )
    db.commit()
    db.refresh(action)
    return action


@router.post("/disbursements/release-eligible", response_model=ReleaseEligibleResponse)
def release_eligible(
    payload: ReleaseEligibleRequest,
    db: Session = db_session,
) -> ReleaseEligibleResponse:
    pay_cycle = db.get(PayCycle, payload.pay_cycle_id)
    if pay_cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pay cycle not found")

    worker_query = db.query(Worker).filter(Worker.ministry == pay_cycle.ministry)
    if payload.worker_ids:
        worker_query = worker_query.filter(Worker.id.in_(payload.worker_ids))
    workers = worker_query.all()

    released: list[StaffAction] = []
    skipped: list[dict[str, str]] = []
    for worker in workers:
        viq = _resolve_viq(db, worker_id=worker.id, pay_cycle_id=pay_cycle.id, viq_id=None)
        if viq is None or viq.verdict != PASS:
            skipped.append({"worker_id": worker.id, "reason": "not pass-verified"})
            continue
        if _latest_action(db, worker.id, pay_cycle.id, "FLAG_INVESTIGATION") is not None:
            skipped.append({"worker_id": worker.id, "reason": "flagged for investigation"})
            continue
        if _latest_action(db, worker.id, pay_cycle.id, "APPROVE_PAYMENT") is not None:
            skipped.append({"worker_id": worker.id, "reason": "already approved"})
            continue
        viq.payment_status = "APPROVED_FOR_RELEASE"
        viq.signed_payload = {**viq.signed_payload, "payment_status": viq.payment_status}
        viq.signature = sign_payload(viq.signed_payload, settings.viq_signing_secret)
        released.append(
            _record_action(
                db,
                worker=worker,
                pay_cycle_id=pay_cycle.id,
                viq_id=viq.id,
                action_type="APPROVE_PAYMENT",
                status="APPROVED",
                note="Bulk salary release approval",
                actor=payload.actor,
                payload={"payment_status": viq.payment_status, "trust_score": viq.trust_score},
            )
        )
    db.commit()
    for action in released:
        db.refresh(action)
    return ReleaseEligibleResponse(released=released, skipped=skipped)


@router.post("/verification-exercises", response_model=VerificationExerciseResponse)
def create_exercise(
    payload: VerificationExerciseCreateRequest,
    db: Session = db_session,
) -> VerificationExerciseResponse:
    exercise = VerificationExercise(**payload.model_dump(), status="DRAFT")
    db.add(exercise)
    db.add(
        AuditLog(
            event_type="VERIFICATION_EXERCISE_CREATED",
            payload={"name": payload.name, "ministry": payload.ministry},
        )
    )
    db.commit()
    db.refresh(exercise)
    return exercise


@router.get("/verification-exercises", response_model=list[VerificationExerciseResponse])
def list_exercises(
    ministry: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = db_session,
) -> list[VerificationExerciseResponse]:
    query = db.query(VerificationExercise).order_by(VerificationExercise.created_at.desc())
    if ministry:
        query = query.filter(VerificationExercise.ministry == ministry)
    return query.limit(limit).all()


@router.patch("/verification-exercises/{exercise_id}", response_model=VerificationExerciseResponse)
def update_exercise(
    exercise_id: str,
    payload: VerificationExerciseUpdateRequest,
    db: Session = db_session,
) -> VerificationExerciseResponse:
    exercise = _exercise(db, exercise_id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(exercise, field, value)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.post(
    "/verification-exercises/{exercise_id}/publish",
    response_model=VerificationExerciseResponse,
)
def publish_exercise(exercise_id: str, db: Session = db_session) -> VerificationExerciseResponse:
    exercise = _exercise(db, exercise_id)
    if not exercise.public_token:
        exercise.public_token = secrets.token_urlsafe(24)
    exercise.status = "PUBLISHED"
    exercise.public_url = f"/verify/exercise/{exercise.public_token}"
    exercise.published_at = datetime.utcnow()
    db.add(
        AuditLog(
            event_type="VERIFICATION_EXERCISE_PUBLISHED",
            payload={"exercise_id": exercise.id, "public_url": exercise.public_url},
        )
    )
    db.commit()
    db.refresh(exercise)
    return exercise


@router.get(
    "/verification-exercises/{exercise_id}/submissions",
    response_model=list[ExerciseSubmissionResponse],
)
def list_exercise_submissions(
    exercise_id: str,
    db: Session = db_session,
) -> list[ExerciseSubmissionResponse]:
    _exercise(db, exercise_id)
    return (
        db.query(ExerciseSubmission)
        .filter(ExerciseSubmission.exercise_id == exercise_id)
        .order_by(ExerciseSubmission.created_at.desc())
        .all()
    )


@router.post(
    "/verification-exercises/{exercise_id}/submissions",
    response_model=ExerciseSubmissionResponse,
)
def create_exercise_submission(
    exercise_id: str,
    payload: ExerciseSubmissionCreateRequest,
    db: Session = db_session,
) -> ExerciseSubmissionResponse:
    _exercise(db, exercise_id)
    submission = ExerciseSubmission(exercise_id=exercise_id, **payload.model_dump())
    db.add(submission)
    db.add(
        AuditLog(
            worker_id=payload.worker_id,
            event_type="VERIFICATION_EXERCISE_SUBMISSION_CREATED",
            payload={"exercise_id": exercise_id, "decision": payload.decision},
        )
    )
    db.commit()
    db.refresh(submission)
    return submission


@router.get("/reports/summary", response_model=AdminSummaryResponse)
def admin_summary(
    ministry: str | None = Query(default=None),
    pay_cycle_id: str | None = Query(default=None),
    db: Session = db_session,
) -> AdminSummaryResponse:
    worker_query = db.query(Worker)
    if pay_cycle_id:
        pay_cycle = db.get(PayCycle, pay_cycle_id)
        if pay_cycle is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pay cycle not found")
        ministry = pay_cycle.ministry
    if ministry:
        worker_query = worker_query.filter(Worker.ministry == ministry)
    workers = worker_query.all()
    worker_ids = [worker.id for worker in workers]

    viq_query = db.query(VIQ)
    if pay_cycle_id:
        viq_query = viq_query.filter(VIQ.pay_cycle_id == pay_cycle_id)
    elif worker_ids:
        viq_query = viq_query.filter(VIQ.worker_id.in_(worker_ids))
    viqs = viq_query.all()
    action_query = db.query(StaffAction)
    if pay_cycle_id:
        action_query = action_query.filter(StaffAction.pay_cycle_id == pay_cycle_id)
    elif worker_ids:
        action_query = action_query.filter(StaffAction.worker_id.in_(worker_ids))
    actions = action_query.all()

    approved_ids = {
        action.worker_id for action in actions if action.action_type == "APPROVE_PAYMENT"
    }
    flagged_ids = {
        action.worker_id for action in actions if action.action_type == "FLAG_INVESTIGATION"
    }
    viq_by_worker = {viq.worker_id: viq for viq in viqs}

    gross = sum((Decimal(worker.salary_amount) for worker in workers), Decimal("0"))
    eligible = sum(
        (
            Decimal(worker.salary_amount)
            for worker in workers
            if worker.id in approved_ids
            or (viq_by_worker.get(worker.id) and viq_by_worker[worker.id].verdict == PASS)
        ),
        Decimal("0"),
    )
    held = gross - eligible

    return AdminSummaryResponse(
        ministry=ministry,
        pay_cycle_id=pay_cycle_id,
        workers=len(workers),
        viqs=len(viqs),
        pass_count=sum(1 for viq in viqs if viq.verdict == "PASS"),
        review_count=sum(1 for viq in viqs if viq.verdict == "REVIEW"),
        fail_count=sum(1 for viq in viqs if viq.verdict == "FAIL"),
        approved_count=len(approved_ids),
        flagged_count=len(flagged_ids),
        held_count=sum(
            1
            for worker in workers
            if worker.id in flagged_ids
            or (viq_by_worker.get(worker.id) and viq_by_worker[worker.id].verdict != PASS)
        ),
        gross_payroll=str(gross),
        eligible_payroll=str(eligible),
        held_payroll=str(held),
    )


def _worker(db: Session, worker_id: str) -> Worker:
    worker = db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="worker not found")
    return worker


def _exercise(db: Session, exercise_id: str) -> VerificationExercise:
    exercise = db.get(VerificationExercise, exercise_id)
    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="verification exercise not found",
        )
    return exercise


def _resolve_viq(
    db: Session,
    *,
    worker_id: str,
    pay_cycle_id: str | None,
    viq_id: str | None,
) -> VIQ | None:
    if viq_id:
        viq = db.get(VIQ, viq_id)
        if viq is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VIQ not found")
        return viq
    query = db.query(VIQ).filter(VIQ.worker_id == worker_id)
    if pay_cycle_id:
        query = query.filter(VIQ.pay_cycle_id == pay_cycle_id)
    return query.order_by(VIQ.created_at.desc()).first()


def _latest_action(
    db: Session,
    worker_id: str,
    pay_cycle_id: str | None,
    action_type: str,
) -> StaffAction | None:
    query = db.query(StaffAction).filter(
        StaffAction.worker_id == worker_id,
        StaffAction.action_type == action_type,
    )
    if pay_cycle_id:
        query = query.filter(StaffAction.pay_cycle_id == pay_cycle_id)
    return query.order_by(StaffAction.created_at.desc()).first()


def _record_action(
    db: Session,
    *,
    worker: Worker,
    pay_cycle_id: str | None,
    viq_id: str | None,
    action_type: str,
    status: str,
    note: str | None,
    actor: str,
    payload: dict[str, Any],
) -> StaffAction:
    action = StaffAction(
        worker_id=worker.id,
        pay_cycle_id=pay_cycle_id,
        viq_id=viq_id,
        action_type=action_type,
        status=status,
        note=note,
        actor=actor,
        payload=payload,
    )
    db.add(action)
    db.add(
        AuditLog(
            worker_id=worker.id,
            pay_cycle_id=pay_cycle_id,
            event_type=action_type,
            payload={**payload, "actor": actor, "note": note},
        )
    )
    return action
