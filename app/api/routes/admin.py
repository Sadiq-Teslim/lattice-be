import secrets
from datetime import datetime
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.ai.document_extraction import UploadedDocument, extract_staff_document_payload
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
    VerificationSession,
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
    IntegrationReadinessResponse,
    WorkerVerificationLinkRequest,
    WorkerVerificationLinkResponse,
)
from app.services.payments import PaymentService
from app.services.squad import SquadAPIError, SquadConfigurationError, SquadService, squad_error_to_http
from app.services.verification_orchestrator import VerificationOrchestrator

router = APIRouter(prefix="/admin", tags=["admin"])
db_session = Depends(get_db)
upload_files = File(default=[])


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
    transfer_results: list[dict[str, Any]] = []
    for worker in workers:
        viq = _resolve_viq(db, worker_id=worker.id, pay_cycle_id=pay_cycle.id, viq_id=None)
        if viq is None or viq.verdict != PASS:
            skipped.append({"worker_id": worker.id, "reason": "not pass-verified"})
            continue
        if _latest_action(db, worker.id, pay_cycle.id, "FLAG_INVESTIGATION") is not None:
            skipped.append({"worker_id": worker.id, "reason": "flagged for investigation"})
            continue
        if _latest_action(db, worker.id, pay_cycle.id, "APPROVE_PAYMENT") is not None:
            if payload.initiate_transfers and not viq.squad_transaction_reference:
                transfer_results.append(_initiate_transfer_for_viq(db, viq))
            else:
                skipped.append({"worker_id": worker.id, "reason": "already approved"})
            continue
        if not viq.squad_transaction_reference:
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
        if payload.initiate_transfers:
            transfer_results.append(_initiate_transfer_for_viq(db, viq))
    db.commit()
    for action in released:
        db.refresh(action)
    return ReleaseEligibleResponse(
        released=released,
        skipped=skipped,
        transfer_results=transfer_results,
    )


@router.post(
    "/verification-sessions/worker-link",
    response_model=WorkerVerificationLinkResponse,
)
def create_worker_verification_link(
    payload: WorkerVerificationLinkRequest,
    db: Session = db_session,
) -> WorkerVerificationLinkResponse:
    worker = _worker(db, payload.worker_id)
    pay_cycle = db.get(PayCycle, payload.pay_cycle_id)
    if pay_cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pay cycle not found")

    session = (
        db.query(VerificationSession)
        .filter(
            VerificationSession.worker_id == worker.id,
            VerificationSession.pay_cycle_id == pay_cycle.id,
            VerificationSession.status != "COMPLETED",
        )
        .order_by(VerificationSession.created_at.desc())
        .first()
    )
    if session is None:
        session = VerificationOrchestrator(db).create_session(
            worker_id=worker.id,
            pay_cycle_id=pay_cycle.id,
        )
    public_url = _worker_verification_url(session.session_token)
    sms_response = None
    sms_sent = False
    if payload.send_sms:
        try:
            sms_response = SquadService().send_sms(
                phone=worker.phone,
                message=(
                    f"Ogun State Ministry of Education verification: {public_url}. "
                    "Complete this before salary release."
                ),
            )
            sms_sent = True
        except (SquadConfigurationError, SquadAPIError) as exc:
            raise squad_error_to_http(exc) from exc
        db.add(
            AuditLog(
                worker_id=worker.id,
                pay_cycle_id=pay_cycle.id,
                event_type="WORKER_VERIFICATION_LINK_SENT",
                payload={"session_id": session.id, "public_url": public_url, "sms_response": sms_response},
            )
        )
        db.commit()
    return WorkerVerificationLinkResponse(
        worker_id=worker.id,
        pay_cycle_id=pay_cycle.id,
        session_id=session.id,
        session_token=session.session_token,
        public_url=public_url,
        sms_sent=sms_sent,
        sms_response=sms_response,
    )


@router.get("/integrations/readiness", response_model=IntegrationReadinessResponse)
def integration_readiness() -> IntegrationReadinessResponse:
    checks = {
        "public_backend_url": bool(settings.public_backend_url.strip()),
        "public_frontend_url": bool(settings.public_frontend_url.strip()),
        "squad_secret_key": bool(settings.squad_secret_key and settings.squad_secret_key.strip()),
        "squad_public_key": bool(settings.squad_public_key and settings.squad_public_key.strip()),
        "squad_merchant_id": bool(settings.squad_merchant_id and settings.squad_merchant_id.strip()),
        "squad_sms_endpoint": bool(settings.squad_sms_endpoint.strip()),
        "worker_verification_url": bool(settings.public_frontend_url.strip()),
    }
    critical = [
        "public_backend_url",
        "public_frontend_url",
        "squad_secret_key",
        "squad_merchant_id",
        "squad_sms_endpoint",
    ]
    ready = all(checks[item] for item in critical)
    return IntegrationReadinessResponse(
        public_backend_url=settings.public_backend_url.rstrip("/"),
        public_frontend_url=settings.public_frontend_url.rstrip("/"),
        worker_verification_base_url=f"{settings.public_frontend_url.rstrip('/')}/verify",
        squad_base_url=settings.squad_base_url,
        squad_secret_configured=checks["squad_secret_key"],
        squad_public_key_configured=checks["squad_public_key"],
        squad_merchant_id_configured=checks["squad_merchant_id"],
        squad_webhook_url=f"{settings.public_backend_url.rstrip('/')}{settings.api_v1_prefix}/webhooks/squad",
        squad_sms_endpoint=settings.squad_sms_endpoint,
        deepfake_model_configured=bool(settings.deepfake_model_path),
        status="READY" if ready else "ACTION_REQUIRED",
        checks=checks,
    )


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


@router.delete("/verification-exercises/{exercise_id}")
def delete_exercise(exercise_id: str, db: Session = db_session) -> dict[str, str]:
    exercise = _exercise(db, exercise_id)
    db.query(ExerciseSubmission).filter(ExerciseSubmission.exercise_id == exercise.id).delete()
    db.add(
        AuditLog(
            event_type="VERIFICATION_EXERCISE_DELETED",
            payload={"exercise_id": exercise.id, "name": exercise.name, "ministry": exercise.ministry},
        )
    )
    db.delete(exercise)
    db.commit()
    return {"status": "deleted"}


@router.post(
    "/verification-exercises/{exercise_id}/publish",
    response_model=VerificationExerciseResponse,
)
def publish_exercise(exercise_id: str, db: Session = db_session) -> VerificationExerciseResponse:
    exercise = _exercise(db, exercise_id)
    if not exercise.public_token:
        exercise.public_token = secrets.token_urlsafe(24)
    exercise.status = "PUBLISHED"
    exercise.public_url = (
        f"{settings.public_frontend_url.rstrip('/')}/verify/exercise/{exercise.public_token}"
    )
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


@router.get(
    "/public/verification-exercises/{public_token}",
    response_model=VerificationExerciseResponse,
)
def get_public_exercise(
    public_token: str,
    db: Session = db_session,
) -> VerificationExerciseResponse:
    exercise = (
        db.query(VerificationExercise)
        .filter(
            VerificationExercise.public_token == public_token,
            VerificationExercise.status == "PUBLISHED",
        )
        .one_or_none()
    )
    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="published verification exercise not found",
        )
    return exercise


@router.get("/public/verification-exercises/{public_token}/staff-match")
def match_public_exercise_staff(
    public_token: str,
    worker_code: str = Query(..., min_length=2),
    full_name: str = Query(..., min_length=2),
    date_of_birth: str | None = Query(default=None),
    phone: str | None = Query(default=None),
    db: Session = db_session,
) -> dict[str, Any]:
    exercise = _published_exercise(db, public_token)
    worker = (
        db.query(Worker)
        .filter(
            Worker.worker_code == worker_code.strip().upper(),
            Worker.ministry == exercise.ministry,
        )
        .one_or_none()
    )
    if worker is None:
        return {
            "status": "NO_MATCH",
            "decision": "REVIEW",
            "message": "Staff ID was not found in this ministry nominal roll.",
            "checks": {"staff_id": False, "name": False, "date_of_birth": False, "phone": False},
        }

    name_score = _name_similarity(worker.full_name, full_name)
    dob_matches = _date_text(worker.date_of_birth) == _date_text(date_of_birth) if date_of_birth else None
    phone_matches = _last4(worker.phone) == _last4(phone) if phone else None
    passed = name_score >= 0.82 and dob_matches is not False and phone_matches is not False
    return {
        "status": "MATCH" if passed else "REVIEW",
        "decision": "PASS" if passed else "REVIEW",
        "message": "Staff identity matched payroll record." if passed else "Staff ID exists, but one or more identity fields need HR review.",
        "worker": {
            "id": worker.id,
            "worker_code": worker.worker_code,
            "full_name": worker.full_name,
            "department": worker.department,
            "phone_last4": _last4(worker.phone),
        },
        "checks": {
            "staff_id": True,
            "name": name_score >= 0.82,
            "name_score": round(name_score, 3),
            "date_of_birth": dob_matches,
            "phone": phone_matches,
        },
    }


@router.post(
    "/public/verification-exercises/{public_token}/submissions",
    response_model=ExerciseSubmissionResponse,
)
def create_public_exercise_submission(
    public_token: str,
    payload: ExerciseSubmissionCreateRequest,
    db: Session = db_session,
) -> ExerciseSubmissionResponse:
    exercise = (
        db.query(VerificationExercise)
        .filter(
            VerificationExercise.public_token == public_token,
            VerificationExercise.status == "PUBLISHED",
        )
        .one_or_none()
    )
    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="published verification exercise not found",
        )

    worker = None
    if payload.worker_code:
        worker = (
            db.query(Worker)
            .filter(
                Worker.worker_code == payload.worker_code,
                Worker.ministry == exercise.ministry,
            )
            .one_or_none()
        )
    submission_payload = payload.model_dump()
    if worker is not None:
        submission_payload["worker_id"] = worker.id
        submission_payload["full_name"] = worker.full_name
    submission = ExerciseSubmission(exercise_id=exercise.id, **submission_payload)
    db.add(submission)
    db.add(
        AuditLog(
            worker_id=submission.worker_id,
            event_type="PUBLIC_VERIFICATION_EXERCISE_SUBMITTED",
            payload={
                "exercise_id": exercise.id,
                "worker_code": submission.worker_code,
                "decision": submission.decision,
            },
        )
    )
    db.commit()
    db.refresh(submission)
    return submission


@router.post(
    "/public/verification-exercises/{public_token}/submissions/upload",
    response_model=ExerciseSubmissionResponse,
)
async def create_public_exercise_upload_submission(
    public_token: str,
    full_name: str = Form(...),
    worker_code: str | None = Form(default=None),
    phone: str | None = Form(default=None),
    date_of_birth: str | None = Form(default=None),
    biometric_status: str | None = Form(default=None),
    liveness_status: str | None = Form(default=None),
    files: list[UploadFile] = upload_files,
    db: Session = db_session,
) -> ExerciseSubmissionResponse:
    exercise = (
        db.query(VerificationExercise)
        .filter(
            VerificationExercise.public_token == public_token,
            VerificationExercise.status == "PUBLISHED",
        )
        .one_or_none()
    )
    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="published verification exercise not found",
        )

    worker = None
    if worker_code:
        worker = (
            db.query(Worker)
            .filter(
                Worker.worker_code == worker_code,
                Worker.ministry == exercise.ministry,
            )
            .one_or_none()
        )

    uploaded_documents = [
        UploadedDocument(
            filename=file.filename or "uploaded-document",
            content_type=file.content_type,
            content=await file.read(),
        )
        for file in files[:10]
    ]
    extracted = extract_staff_document_payload(uploaded_documents)
    required = {_document_key(item) for item in exercise.documents or []}
    submitted = set(extracted["submitted_documents"])
    missing = sorted(required - submitted) if required else []
    identity = _submission_identity_result(
        worker=worker,
        full_name=full_name,
        date_of_birth=date_of_birth,
        phone=phone,
        worker_code=worker_code,
    )
    document_status = "DOCUMENT_INCOMPLETE" if missing else "DOCUMENTS_SUBMITTED"
    needs_review = identity["status"] != "MATCH" or bool(missing) or (
        "biometric_match" in exercise.rules and biometric_status != "BIOMETRIC_MATCH"
    ) or (
        "proof_of_life" in exercise.rules and liveness_status != "PASSED"
    )

    submission = ExerciseSubmission(
        exercise_id=exercise.id,
        worker_id=worker.id if worker is not None else None,
        worker_code=worker_code,
        full_name=worker.full_name if worker is not None else full_name,
        document_status=document_status,
        liveness_status=liveness_status,
        decision="REVIEW" if needs_review else "PASS",
        payload={
            "phone": phone,
            "date_of_birth": date_of_birth,
            "biometric_status": biometric_status,
            "identity": identity,
            "exercise_name": exercise.name,
            "documents_required": exercise.documents,
            "documents_submitted": sorted(submitted),
            "missing_documents": [_document_label(item) for item in missing],
            "uploaded_files": [
                {
                    "filename": document["filename"],
                    "content_type": document["content_type"],
                    "document_type": document["document_type"],
                    "extraction_method": document["extraction_method"],
                    "text_characters": document["text_characters"],
                }
                for document in extracted["extracted_documents"]
            ],
            "extracted_dates": extracted["extracted_dates"],
            "rules": exercise.rules,
            "submitted_at": datetime.utcnow().isoformat(),
        },
    )
    db.add(submission)
    db.add(
        AuditLog(
            worker_id=submission.worker_id,
            event_type="PUBLIC_VERIFICATION_EXERCISE_UPLOADED",
            payload={
                "exercise_id": exercise.id,
                "worker_code": submission.worker_code,
                "decision": submission.decision,
                "document_status": document_status,
            },
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


def _published_exercise(db: Session, public_token: str) -> VerificationExercise:
    exercise = (
        db.query(VerificationExercise)
        .filter(
            VerificationExercise.public_token == public_token,
            VerificationExercise.status == "PUBLISHED",
        )
        .one_or_none()
    )
    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="published verification exercise not found",
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


def _worker_verification_url(session_token: str) -> str:
    return f"{settings.public_frontend_url.rstrip('/')}/verify/{session_token}"


def _submission_identity_result(
    *,
    worker: Worker | None,
    full_name: str,
    date_of_birth: str | None,
    phone: str | None,
    worker_code: str | None,
) -> dict[str, Any]:
    if worker is None:
        return {
            "status": "NO_MATCH",
            "message": "Staff ID was not found in the nominal roll.",
            "checks": {"staff_id": False, "name": False, "date_of_birth": False, "phone": False},
            "submitted_worker_code": worker_code,
        }
    name_score = _name_similarity(worker.full_name, full_name)
    dob_matches = _date_text(worker.date_of_birth) == _date_text(date_of_birth) if date_of_birth else None
    phone_matches = _last4(worker.phone) == _last4(phone) if phone else None
    passed = name_score >= 0.82 and dob_matches is not False and phone_matches is not False
    return {
        "status": "MATCH" if passed else "REVIEW",
        "message": "Submitted identity matches payroll record." if passed else "Submitted identity needs HR review.",
        "checks": {
            "staff_id": True,
            "name": name_score >= 0.82,
            "name_score": round(name_score, 3),
            "date_of_birth": dob_matches,
            "phone": phone_matches,
        },
    }


def _document_key(value: str) -> str:
    normalized = value.strip().lower().replace("&", "and")
    aliases = {
        "appointment letter": "appointment_letter",
        "birth certificate / declaration of age": "birth_certificate",
        "birth certificate": "birth_certificate",
        "declaration of age": "birth_certificate",
        "last promotion letter": "promotion_letter",
        "promotion letter": "promotion_letter",
        "posting letter": "posting_letter",
        "staff id card": "staff_id_card",
        "bvn identity record": "bvn_identity_record",
    }
    return aliases.get(normalized, normalized.replace(" ", "_").replace("/", "_"))


def _document_label(value: str) -> str:
    labels = {
        "appointment_letter": "Appointment letter",
        "birth_certificate": "Birth certificate / declaration of age",
        "promotion_letter": "Last promotion letter",
        "posting_letter": "Posting letter",
        "staff_id_card": "Staff ID card",
        "bvn_identity_record": "BVN identity record",
    }
    return labels.get(value, value.replace("_", " ").title())


def _name_similarity(left: str | None, right: str | None) -> float:
    def normalize(value: str | None) -> str:
        return " ".join("".join(char.lower() if char.isalnum() else " " for char in (value or "")).split())

    expected = normalize(left)
    submitted = normalize(right)
    if not expected or not submitted:
        return 0.0
    expected_parts = set(expected.split())
    submitted_parts = set(submitted.split())
    token_score = len(expected_parts & submitted_parts) / max(len(expected_parts | submitted_parts), 1)
    sequence_score = SequenceMatcher(None, expected, submitted).ratio()
    return max(token_score, sequence_score)


def _date_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text[:10], fmt).date().isoformat()
        except ValueError:
            continue
    return text[:10]


def _last4(value: str | None) -> str | None:
    digits = "".join(char for char in (value or "") if char.isdigit())
    return digits[-4:] if digits else None


def _initiate_transfer_for_viq(db: Session, viq: VIQ) -> dict[str, Any]:
    try:
        updated_viq, squad_response = PaymentService(db).initiate_viq_transfer(viq_id=viq.id)
    except HTTPException as exc:
        return {
            "worker_id": viq.worker_id,
            "viq_id": viq.id,
            "status": "TRANSFER_FAILED",
            "reason": exc.detail,
        }
    return {
        "worker_id": updated_viq.worker_id,
        "viq_id": updated_viq.id,
        "status": updated_viq.payment_status,
        "transaction_reference": updated_viq.squad_transaction_reference,
        "squad_response": squad_response,
    }


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
