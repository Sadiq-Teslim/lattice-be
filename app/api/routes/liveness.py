from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.liveness import evaluate_liveness
from app.core.offline_signature import verify_p256_signature
from app.db.models import AuditLog
from app.db.session import get_db
from app.schemas.liveness import (
    LivenessChallengeResult,
    LivenessEvaluationResponse,
    LivenessSyncItem,
    LivenessSyncRequest,
    LivenessSyncResponse,
)

router = APIRouter(prefix="/ai/liveness", tags=["ai"])
db_session = Depends(get_db)


@router.post("/evaluate", response_model=LivenessEvaluationResponse)
def evaluate_liveness_result(payload: LivenessChallengeResult) -> LivenessEvaluationResponse:
    return LivenessEvaluationResponse(**evaluate_liveness(payload))


@router.post("/sync", response_model=LivenessSyncResponse)
def sync_offline_liveness(
    payload: LivenessSyncRequest,
    db: Session = db_session,
) -> LivenessSyncResponse:
    results: list[LivenessSyncItem] = []
    for record in payload.records:
        evaluation = evaluate_liveness(record.payload)
        signature_valid = verify_p256_signature(
            payload_hash=record.payload_hash,
            signature=record.signature,
            public_jwk=record.public_key_jwk,
        )
        if not signature_valid:
            results.append(
                LivenessSyncItem(
                    cache_id=record.cache_id,
                    status=evaluation["status"],
                    confidence=evaluation["confidence"],
                    synced=False,
                    signature_valid=False,
                    reasons=[*evaluation["reasons"], "offline signature invalid"],
                )
            )
            continue
        db.add(
            AuditLog(
                worker_id=record.worker_id,
                pay_cycle_id=record.pay_cycle_id,
                event_type="OFFLINE_LIVENESS_SYNCED",
                payload={
                    "cache_id": record.cache_id,
                    "payload_hash": record.payload_hash,
                    "captured_at": record.captured_at,
                    "session_id": record.session_id,
                    "signature_valid": signature_valid,
                    "evaluation": evaluation,
                },
            )
        )
        results.append(
            LivenessSyncItem(
                cache_id=record.cache_id,
                status=evaluation["status"],
                confidence=evaluation["confidence"],
                synced=True,
                signature_valid=True,
                reasons=evaluation["reasons"],
            )
        )
    db.commit()
    return LivenessSyncResponse(
        received=len(payload.records),
        synced=len(results),
        results=results,
    )
