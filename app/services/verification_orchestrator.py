import secrets
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.ai.anomaly import PayrollAnomalyDetector
from app.core.scoring import VerificationSignals, compute_trust_score
from app.db.models import PayCycle, VerificationSession, Worker
from app.services.audit import AuditService
from app.services.viq import VIQService


class VerificationOrchestrator:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.viq_service = VIQService(db)

    def create_session(self, *, worker_id: str, pay_cycle_id: str) -> VerificationSession:
        worker = self._get_worker(worker_id)
        pay_cycle = self._get_pay_cycle(pay_cycle_id)
        session = VerificationSession(
            worker_id=worker.id,
            pay_cycle_id=pay_cycle.id,
            session_token=secrets.token_urlsafe(32),
            status="PENDING",
            evidence={},
        )
        self.db.add(session)
        self.audit.log(
            event_type="VERIFICATION_SESSION_CREATED",
            worker_id=worker.id,
            pay_cycle_id=pay_cycle.id,
            payload={"session_id": session.id, "worker_code": worker.worker_code},
        )
        self.db.commit()
        self.db.refresh(session)
        return session

    def submit_evidence(self, *, session_id: str, evidence: dict[str, Any]) -> VerificationSession:
        session = self._get_session(session_id)
        merged_evidence = {**(session.evidence or {}), **evidence}
        session.evidence = merged_evidence

        if "liveness" in evidence:
            session.liveness_status = evidence["liveness"].get("status")
            session.attempts = int(evidence["liveness"].get("attempts") or session.attempts or 0)
        if "deepfake" in evidence:
            session.deepfake_status = evidence["deepfake"].get("status")
        if "bvn" in evidence:
            session.bvn_status = evidence["bvn"].get("status")

        self.audit.log(
            event_type="VERIFICATION_EVIDENCE_SUBMITTED",
            worker_id=session.worker_id,
            pay_cycle_id=session.pay_cycle_id,
            payload={"session_id": session.id, "evidence_keys": sorted(evidence.keys())},
        )
        self.db.commit()
        self.db.refresh(session)
        return session

    def finalize_session(self, *, session_id: str) -> tuple[VerificationSession, Any]:
        session = self._get_session(session_id)
        if session.viq is not None:
            return session, session.viq

        worker = session.worker
        anomaly_result = self._run_anomaly_scan(worker=worker, pay_cycle=session.pay_cycle)
        session.anomaly_status = "ANOMALY_FLAGGED" if anomaly_result.flagged else "CLEAN"

        evidence = session.evidence or {}
        face_match_status = None
        if isinstance(evidence.get("face_match"), dict):
            face_match_status = evidence["face_match"].get("status")
        document_status = None
        if isinstance(evidence.get("documents"), dict):
            document_status = evidence["documents"].get("status")

        score = compute_trust_score(
            VerificationSignals(
                liveness_status=session.liveness_status,
                liveness_attempts=session.attempts,
                deepfake_status=session.deepfake_status,
                face_match_status=face_match_status,
                anomaly_flagged=anomaly_result.flagged,
                bvn_status=session.bvn_status,
                document_status=document_status,
            )
        )
        viq_evidence = {
            **evidence,
            "anomaly": {
                "status": session.anomaly_status,
                "score": anomaly_result.anomaly_score,
                "explanations": anomaly_result.explanations,
            },
        }
        viq = self.viq_service.create_viq(
            worker=worker,
            session=session,
            score=score,
            evidence=viq_evidence,
        )
        session.status = "COMPLETED"
        session.completed_at = datetime.utcnow()
        self.audit.log(
            event_type="VIQ_CREATED",
            worker_id=worker.id,
            pay_cycle_id=session.pay_cycle_id,
            payload={
                "session_id": session.id,
                "trust_score": score.trust_score,
                "verdict": score.verdict,
                "flags": score.flags,
            },
        )
        self.db.commit()
        self.db.refresh(session)
        self.db.refresh(viq)
        return session, viq

    def _run_anomaly_scan(self, *, worker: Worker, pay_cycle: PayCycle):
        workers = self.db.query(Worker).filter(Worker.ministry == pay_cycle.ministry).all()
        if len(workers) < 20:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "at least 20 workers in the pay-cycle ministry are required "
                    "for anomaly scan"
                ),
            )
        records = [_worker_to_anomaly_record(item) for item in workers]
        results = PayrollAnomalyDetector(contamination=0.05).scan(records)
        result_by_code = {result.worker_code: result for result in results}
        return result_by_code[worker.worker_code]

    def _get_worker(self, worker_id: str) -> Worker:
        worker = self.db.get(Worker, worker_id)
        if worker is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="worker not found")
        return worker

    def _get_pay_cycle(self, pay_cycle_id: str) -> PayCycle:
        pay_cycle = self.db.get(PayCycle, pay_cycle_id)
        if pay_cycle is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pay cycle not found")
        return pay_cycle

    def _get_session(self, session_id: str) -> VerificationSession:
        session = self.db.get(VerificationSession, session_id)
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="verification session not found",
            )
        return session


def _worker_to_anomaly_record(worker: Worker) -> dict:
    return {
        "worker_code": worker.worker_code,
        "device_id": worker.device_id,
        "gps_lat": worker.gps_lat,
        "gps_lng": worker.gps_lng,
        "registration_ip": worker.registration_ip,
        "registration_timestamp": worker.registration_timestamp or datetime.utcnow(),
        "bvn": worker.bvn,
    }
