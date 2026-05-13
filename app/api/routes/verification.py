from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.verification import (
    VerificationEvidenceSubmitRequest,
    VerificationFinalizeResponse,
    VerificationSessionCreateRequest,
    VerificationSessionResponse,
)
from app.services.verification_orchestrator import VerificationOrchestrator

router = APIRouter(prefix="/verification", tags=["verification"])
db_session = Depends(get_db)


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
