from datetime import date, datetime
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.ai.document_consistency import evaluate_document_consistency
from app.ai.document_extraction import UploadedDocument, extract_staff_document_payload
from app.ai.face_match import FaceMatchUnavailable, compare_templates, get_face_embedding_service
from app.core.config import settings
from app.db.models import OtpChallenge, VerificationSession, Worker
from app.db.session import get_db
from app.schemas.document_consistency import (
    DocumentConsistencyRequest,
    DocumentConsistencyResponse,
    StaffDocumentRecord,
)
from app.schemas.verification import (
    PublicOtpSendResponse,
    PublicOtpVerifyRequest,
    PublicOtpVerifyResponse,
    PublicDocumentUploadResponse,
    PublicFaceVerificationResponse,
    PublicPayCycleResponse,
    PublicVerificationSessionResponse,
    PublicWorkerVerificationResponse,
    BvnEvidence,
    VerificationEvidenceSubmitRequest,
    VerificationFinalizeResponse,
    VerificationSessionCreateRequest,
    VerificationSessionResponse,
)
from app.services.otp import OTPService
from app.services.identity import SquadIdentityVerifier
from app.services.verification_orchestrator import VerificationOrchestrator

router = APIRouter(prefix="/verification", tags=["verification"])
db_session = Depends(get_db)
upload_files = File(...)
upload_file = File(...)


@router.post(
    "/sessions",
    response_model=VerificationSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_verification_session(
    payload: VerificationSessionCreateRequest,
    db: Session = db_session,
) -> VerificationSessionResponse:
    orchestrator = VerificationOrchestrator(db)
    return orchestrator.create_session(
        worker_id=payload.worker_id,
        pay_cycle_id=payload.pay_cycle_id,
    )


@router.get("/sessions/{session_id}", response_model=VerificationSessionResponse)
def get_verification_session(
    session_id: str,
    db: Session = db_session,
) -> VerificationSessionResponse:
    orchestrator = VerificationOrchestrator(db)
    return orchestrator._get_session(session_id)


@router.post("/sessions/{session_id}/evidence", response_model=VerificationSessionResponse)
def submit_verification_evidence(
    session_id: str,
    payload: VerificationEvidenceSubmitRequest,
    db: Session = db_session,
) -> VerificationSessionResponse:
    evidence = payload.model_dump(exclude_none=True)
    orchestrator = VerificationOrchestrator(db)
    return orchestrator.submit_evidence(session_id=session_id, evidence=evidence)


@router.post("/sessions/{session_id}/finalize", response_model=VerificationFinalizeResponse)
def finalize_verification_session(
    session_id: str,
    db: Session = db_session,
) -> VerificationFinalizeResponse:
    orchestrator = VerificationOrchestrator(db)
    session, viq = orchestrator.finalize_session(session_id=session_id)
    return VerificationFinalizeResponse(session=session, viq=viq)


@router.get(
    "/public/sessions/{session_token}",
    response_model=PublicVerificationSessionResponse,
)
def get_public_verification_session(
    session_token: str,
    db: Session = db_session,
) -> PublicVerificationSessionResponse:
    session = _get_public_session(db, session_token)
    return _public_session_response(session)


@router.post(
    "/public/sessions/{session_token}/otp/send",
    response_model=PublicOtpSendResponse,
)
def send_public_verification_otp(
    session_token: str,
    db: Session = db_session,
) -> PublicOtpSendResponse:
    session = _get_public_session(db, session_token)
    challenge = OTPService(db).send_worker_otp(
        worker_id=session.worker_id,
        pay_cycle_id=session.pay_cycle_id,
        purpose="PAYROLL_VERIFICATION",
    )
    return PublicOtpSendResponse(
        challenge_id=challenge.id,
        phone_last4=_last4(challenge.phone),
        status=challenge.status,
        expires_at=challenge.expires_at.isoformat(),
    )


@router.post(
    "/public/sessions/{session_token}/otp/verify",
    response_model=PublicOtpVerifyResponse,
)
def verify_public_verification_otp(
    session_token: str,
    payload: PublicOtpVerifyRequest,
    db: Session = db_session,
) -> PublicOtpVerifyResponse:
    session = _get_public_session(db, session_token)
    challenge = OTPService(db).verify_otp(challenge_id=payload.challenge_id, otp=payload.otp)
    if challenge.worker_id != session.worker_id or challenge.pay_cycle_id != session.pay_cycle_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OTP challenge does not belong to this verification session",
        )
    return PublicOtpVerifyResponse(
        challenge_id=challenge.id,
        status=challenge.status,
        attempts=challenge.attempts,
        verified=challenge.status == "VERIFIED",
    )


@router.post(
    "/public/sessions/{session_token}/evidence",
    response_model=PublicVerificationSessionResponse,
)
def submit_public_verification_evidence(
    session_token: str,
    payload: VerificationEvidenceSubmitRequest,
    db: Session = db_session,
) -> PublicVerificationSessionResponse:
    session = _get_public_session(db, session_token)
    _require_verified_otp(db, session)
    evidence = payload.model_dump(exclude_none=True)
    updated = VerificationOrchestrator(db).submit_evidence(session_id=session.id, evidence=evidence)
    return _public_session_response(updated)


@router.post(
    "/public/sessions/{session_token}/documents/evaluate",
    response_model=DocumentConsistencyResponse,
)
def evaluate_public_session_documents(
    session_token: str,
    db: Session = db_session,
) -> DocumentConsistencyResponse:
    session = _get_public_session(db, session_token)
    _require_verified_otp(db, session)
    worker = session.worker
    cohort = db.query(Worker).filter(Worker.ministry == worker.ministry).all()
    payload = DocumentConsistencyRequest(
        worker_record=_document_record(worker),
        cohort_records=[_document_record(item) for item in cohort],
    )
    return DocumentConsistencyResponse(**evaluate_document_consistency(payload))


@router.post(
    "/public/sessions/{session_token}/documents/upload",
    response_model=PublicDocumentUploadResponse,
)
async def upload_public_session_documents(
    session_token: str,
    files: list[UploadFile] = upload_files,
    db: Session = db_session,
) -> PublicDocumentUploadResponse:
    session = _get_public_session(db, session_token)
    _require_verified_otp(db, session)
    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="at least one document is required",
        )
    documents = [
        UploadedDocument(
            filename=file.filename or "uploaded-document",
            content_type=file.content_type,
            content=await file.read(),
        )
        for file in files[:10]
    ]
    extracted = extract_staff_document_payload(documents)
    worker = session.worker
    cohort = db.query(Worker).filter(Worker.ministry == worker.ministry).all()
    profile = worker.risk_metadata.get("document_profile") if worker.risk_metadata else None
    profile_payload = profile if isinstance(profile, dict) else {}
    uploaded_fields = extracted.get("fields") if isinstance(extracted.get("fields"), dict) else {}
    required_documents = profile_payload.get("required_documents") or []
    worker_record = _document_record(
        worker,
        overrides={
            **uploaded_fields,
            "submitted_documents": extracted["submitted_documents"],
            "required_documents": required_documents,
            "document_numbers": {
                **_string_map(profile_payload.get("document_numbers")),
                **_string_map(extracted.get("document_numbers")),
            },
        },
    )
    payload = DocumentConsistencyRequest(
        worker_record=worker_record,
        cohort_records=[_document_record(item) for item in cohort],
    )
    result = evaluate_document_consistency(payload)
    return PublicDocumentUploadResponse(
        status=result["status"],
        severity=result["severity"],
        flags=result["flags"],
        summary=result["summary"],
        submitted_documents=extracted["submitted_documents"],
        extracted_documents=extracted["extracted_documents"],
        extracted_dates=extracted["extracted_dates"],
        text_excerpt=extracted["text_excerpt"] or None,
    )


@router.post(
    "/public/sessions/{session_token}/identity/verify",
    response_model=BvnEvidence | None,
)
def verify_public_session_identity(
    session_token: str,
    db: Session = db_session,
) -> BvnEvidence | None:
    session = _get_public_session(db, session_token)
    _require_verified_otp(db, session)
    evidence = SquadIdentityVerifier(db).verify_worker_bvn(session.worker)
    if evidence is None:
        return None
    return BvnEvidence(**evidence)


@router.post(
    "/public/sessions/{session_token}/face/verify",
    response_model=PublicFaceVerificationResponse,
)
async def verify_public_session_face(
    session_token: str,
    file: UploadFile = upload_file,
    db: Session = db_session,
) -> PublicFaceVerificationResponse:
    session = _get_public_session(db, session_token)
    _require_verified_otp(db, session)
    image = await _read_image(file)
    try:
        service = get_face_embedding_service()
    except FaceMatchUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    candidate_template = service.embed(image)
    reference_template = session.worker.biometric_template
    if not reference_template:
        session.worker.biometric_template = candidate_template
        db.commit()
        db.refresh(session.worker)
        return PublicFaceVerificationResponse(
            status="MATCH",
            similarity=1.0,
            threshold=settings.face_match_threshold,
            model_name=candidate_template["model_name"],
            model_version=candidate_template["model_version"],
            reference_source="enrolled_from_live_capture",
            candidate_preprocessing=candidate_template.get("preprocessing", {}),
        )

    comparison = compare_templates(
        reference_template=reference_template,
        candidate_template=candidate_template,
        threshold=settings.face_match_threshold,
    )
    return PublicFaceVerificationResponse(
        status=comparison["status"],
        similarity=comparison["similarity"],
        threshold=comparison["threshold"],
        model_name=comparison["model_name"],
        model_version=comparison["model_version"],
        reference_source="stored_worker_template",
        candidate_preprocessing=comparison["candidate_preprocessing"],
    )


@router.post(
    "/public/sessions/{session_token}/finalize",
    response_model=VerificationFinalizeResponse,
)
def finalize_public_verification_session(
    session_token: str,
    db: Session = db_session,
) -> VerificationFinalizeResponse:
    session = _get_public_session(db, session_token)
    _require_verified_otp(db, session)
    finalized_session, viq = VerificationOrchestrator(db).finalize_session(session_id=session.id)
    return VerificationFinalizeResponse(session=finalized_session, viq=viq)


def _get_public_session(db: Session, session_token: str) -> VerificationSession:
    session = (
        db.query(VerificationSession)
        .filter(VerificationSession.session_token == session_token)
        .first()
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="verification link not found",
        )
    return session


def _require_verified_otp(db: Session, session: VerificationSession) -> None:
    verified = (
        db.query(OtpChallenge)
        .filter(
            OtpChallenge.worker_id == session.worker_id,
            OtpChallenge.pay_cycle_id == session.pay_cycle_id,
            OtpChallenge.purpose == "PAYROLL_VERIFICATION",
            OtpChallenge.status == "VERIFIED",
        )
        .order_by(OtpChallenge.verified_at.desc())
        .first()
    )
    if verified is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OTP verification is required before submitting evidence",
        )


def _public_session_response(session: VerificationSession) -> PublicVerificationSessionResponse:
    worker = session.worker
    pay_cycle = session.pay_cycle
    return PublicVerificationSessionResponse(
        session=session,
        worker=PublicWorkerVerificationResponse(
            id=worker.id,
            worker_code=worker.worker_code,
            full_name=worker.full_name,
            phone_last4=_last4(worker.phone),
            ministry=worker.ministry,
            department=worker.department,
            date_of_birth=worker.date_of_birth,
            salary_amount=str(worker.salary_amount),
            status=worker.status,
        ),
        pay_cycle=PublicPayCycleResponse(
            id=pay_cycle.id,
            name=pay_cycle.name,
            ministry=pay_cycle.ministry,
            status=pay_cycle.status,
        ),
        viq=session.viq,
    )


def _last4(value: str | None) -> str:
    if not value:
        return "****"
    return value[-4:].rjust(4, "*")


def _document_record(worker: Worker, overrides: dict | None = None) -> StaffDocumentRecord:
    profile = worker.risk_metadata.get("document_profile") if worker.risk_metadata else None
    profile_payload = profile if isinstance(profile, dict) else {}
    if overrides:
        profile_payload = {**profile_payload, **overrides}
    return StaffDocumentRecord(
        worker_id=worker.worker_code,
        full_name=worker.full_name,
        payroll_dob=_date_value(profile_payload.get("payroll_dob") or worker.date_of_birth),
        bvn_dob=_date_value(profile_payload.get("bvn_dob") or worker.date_of_birth),
        file_dob=_date_value(profile_payload.get("file_dob") or worker.date_of_birth),
        document_numbers={
            "bvn": worker.bvn,
            **_string_map(profile_payload.get("document_numbers")),
        },
        **{
            key: value
            for key, value in profile_payload.items()
            if key
            in {
                "appointment_date",
                "first_salary_date",
                "confirmation_date",
                "last_promotion_date",
                "retirement_date",
                "required_documents",
                "submitted_documents",
            }
        },
    )


def _string_map(value: object) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {str(key): str(item) for key, item in value.items() if item is not None}


def _date_value(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


async def _read_image(file: UploadFile) -> Image.Image:
    content = await file.read()
    try:
        return Image.open(BytesIO(content)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{file.filename} is not a valid image",
        ) from exc
