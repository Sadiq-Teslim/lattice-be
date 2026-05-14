from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.scoring import PASS
from app.db.models import PayCycle, Worker
from app.schemas.sdk import VerifyAndDisburseRequest
from app.services.identity import SquadIdentityVerifier
from app.services.payments import PaymentService
from app.services.verification_orchestrator import VerificationOrchestrator


class SDKService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def verify_and_disburse(self, payload: VerifyAndDisburseRequest) -> dict:
        worker = self._resolve_worker(payload)
        pay_cycle = self._resolve_pay_cycle(payload, worker)

        orchestrator = VerificationOrchestrator(self.db)
        session = orchestrator.create_session(worker_id=worker.id, pay_cycle_id=pay_cycle.id)
        evidence = payload.evidence.model_dump(exclude_none=True)
        if "bvn" not in evidence:
            bvn_evidence = SquadIdentityVerifier(self.db).verify_worker_bvn(worker)
            if bvn_evidence is not None:
                evidence["bvn"] = bvn_evidence
        orchestrator.submit_evidence(
            session_id=session.id,
            evidence=evidence,
        )
        _, viq = orchestrator.finalize_session(session_id=session.id)

        transfer_response = None
        payment_attempted = False
        payment_blocked_reason = None

        if payload.initiate_transfer:
            if viq.verdict != PASS:
                payment_blocked_reason = f"VIQ verdict is {viq.verdict}"
            elif payload.transfer is None:
                payment_blocked_reason = (
                    "transfer payload is required when initiate_transfer is true"
                )
            else:
                payment_attempted = True
                viq, squad_response = PaymentService(self.db).initiate_viq_transfer(
                    viq_id=viq.id,
                    bank_code=payload.transfer.bank_code,
                    account_number=payload.transfer.account_number,
                    account_name=payload.transfer.account_name,
                    amount_naira=payload.transfer.amount_naira,
                    remark=payload.transfer.remark,
                )
                transfer_response = {
                    "viq_id": viq.id,
                    "transaction_reference": str(viq.squad_transaction_reference),
                    "payment_status": viq.payment_status,
                    "squad_response": squad_response,
                }

        return {
            "worker": worker,
            "pay_cycle": pay_cycle,
            "viq": viq,
            "payment_attempted": payment_attempted,
            "payment_blocked_reason": payment_blocked_reason,
            "transfer": transfer_response,
        }

    def _resolve_worker(self, payload: VerifyAndDisburseRequest) -> Worker:
        if payload.worker_id:
            worker = self.db.get(Worker, payload.worker_id)
            if worker is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="worker not found",
                )
            return worker
        if payload.worker is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="worker_id or worker payload is required",
            )
        existing = (
            self.db.query(Worker)
            .filter(Worker.worker_code == payload.worker.worker_code)
            .one_or_none()
        )
        if existing is not None:
            return existing
        worker = Worker(**payload.worker.model_dump())
        self.db.add(worker)
        self.db.commit()
        self.db.refresh(worker)
        return worker

    def _resolve_pay_cycle(self, payload: VerifyAndDisburseRequest, worker: Worker) -> PayCycle:
        if payload.pay_cycle_id:
            pay_cycle = self.db.get(PayCycle, payload.pay_cycle_id)
            if pay_cycle is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="pay cycle not found",
                )
            return pay_cycle
        if payload.pay_cycle is not None:
            pay_cycle = PayCycle(
                name=payload.pay_cycle.name,
                ministry=payload.pay_cycle.ministry,
                status="ACTIVE",
            )
        else:
            pay_cycle = PayCycle(
                name="SDK Verification Cycle",
                ministry=worker.ministry,
                status="ACTIVE",
            )
        self.db.add(pay_cycle)
        self.db.commit()
        self.db.refresh(pay_cycle)
        return pay_cycle
