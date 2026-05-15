from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.biometrics import (
    BiometricTemplateError,
    biometric_quality,
    compare_biometric_templates,
)
from app.core.auth import require_lattice_api_key
from app.db.models import Worker
from app.db.session import get_db
from app.schemas.biometrics import (
    BiometricCompareRequest,
    BiometricEnrollRequest,
    BiometricVerifyResponse,
    BiometricWorkerVerifyRequest,
)

router = APIRouter(
    prefix="/ai/biometrics",
    tags=["ai"],
    dependencies=[Depends(require_lattice_api_key)],
)
db_session = Depends(get_db)


@router.post("/verify-template", response_model=BiometricVerifyResponse)
def verify_biometric_template(payload: BiometricCompareRequest) -> BiometricVerifyResponse:
    if payload.enrolled_template.modality != payload.captured_template.modality:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="enrolled and captured templates must use the same biometric modality",
        )
    try:
        result = compare_biometric_templates(
            enrolled_vector=payload.enrolled_template.vector,
            captured_vector=payload.captured_template.vector,
            threshold=payload.threshold,
        )
    except BiometricTemplateError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return BiometricVerifyResponse(
        **result,
        modality=payload.enrolled_template.modality,
        enrolled_quality=biometric_quality(payload.enrolled_template.vector),
        captured_quality=biometric_quality(payload.captured_template.vector),
        reference_source="request.enrolled_template",
    )


@router.post("/workers/{worker_id}/enroll")
def enroll_worker_biometric(
    worker_id: str,
    payload: BiometricEnrollRequest,
    db: Session = db_session,
) -> dict:
    worker = db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="worker not found")
    try:
        quality = biometric_quality(payload.template.vector)
    except BiometricTemplateError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if not quality["usable"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="biometric template quality is too low for enrolment",
        )

    worker.biometric_template = {
        "modality": payload.template.modality,
        "vector": payload.template.vector,
        "provider": payload.template.provider,
        "captured_at": payload.template.captured_at,
        "metadata": payload.template.metadata,
        "quality": quality,
    }
    db.commit()
    return {
        "worker_id": worker.id,
        "status": "ENROLLED",
        "modality": payload.template.modality,
        "quality": quality,
    }


@router.post("/workers/{worker_id}/verify", response_model=BiometricVerifyResponse)
def verify_worker_biometric(
    worker_id: str,
    payload: BiometricWorkerVerifyRequest,
    db: Session = db_session,
) -> BiometricVerifyResponse:
    worker = db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="worker not found")
    enrolled = worker.biometric_template if isinstance(worker.biometric_template, dict) else None
    if not enrolled or not isinstance(enrolled.get("vector"), list):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="worker does not have an enrolled biometric template",
        )
    if enrolled.get("modality") != payload.captured_template.modality:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="captured template modality does not match enrolled worker template",
        )

    try:
        result = compare_biometric_templates(
            enrolled_vector=enrolled["vector"],
            captured_vector=payload.captured_template.vector,
            threshold=payload.threshold,
        )
    except BiometricTemplateError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return BiometricVerifyResponse(
        **result,
        modality=payload.captured_template.modality,
        enrolled_quality=enrolled.get("quality") or biometric_quality(enrolled["vector"]),
        captured_quality=biometric_quality(payload.captured_template.vector),
        worker_id=worker.id,
        reference_source="worker.biometric_template",
    )
