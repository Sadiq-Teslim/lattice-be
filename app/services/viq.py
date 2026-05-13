from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.scoring import ScoreBreakdown
from app.core.security import sign_payload
from app.db.models import VIQ, VerificationSession, Worker


class VIQService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_viq(
        self,
        *,
        worker: Worker,
        session: VerificationSession,
        score: ScoreBreakdown,
        evidence: dict[str, Any],
    ) -> VIQ:
        timestamp = datetime.now(UTC).isoformat()
        payload = {
            "worker_id": worker.id,
            "worker_code": worker.worker_code,
            "pay_cycle_id": session.pay_cycle_id,
            "session_id": session.id,
            "trust_score": score.trust_score,
            "verdict": score.verdict,
            "flags": score.flags,
            "deductions": score.deductions,
            "hard_block": score.hard_block,
            "evidence": evidence,
            "squad_transaction_reference": None,
            "payment_status": "NOT_INITIATED",
            "created_at": timestamp,
        }
        signature = sign_payload(payload, settings.viq_signing_secret)
        viq = VIQ(
            worker_id=worker.id,
            pay_cycle_id=session.pay_cycle_id,
            session_id=session.id,
            trust_score=score.trust_score,
            verdict=score.verdict,
            flags=score.flags,
            signed_payload=payload,
            signature=signature,
            squad_transaction_reference=None,
            payment_status="NOT_INITIATED",
        )
        self.db.add(viq)
        return viq

