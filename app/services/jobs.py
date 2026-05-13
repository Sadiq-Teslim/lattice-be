from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Job
from app.db.session import SessionLocal
from app.schemas.sdk import VerifyAndDisburseRequest, VerifyAndDisburseResponse
from app.services.sdk import SDKService

SDK_VERIFICATION_JOB = "SDK_VERIFY_AND_DISBURSE"


class JobService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def enqueue_sdk_verification(self, payload: VerifyAndDisburseRequest) -> Job:
        job = Job(
            kind=SDK_VERIFICATION_JOB,
            payload=payload.model_dump(mode="json", exclude_none=True),
        )
        self.db.add(job)
        self.db.flush()
        self.db.add(
            AuditLog(
                worker_id=payload.worker_id,
                pay_cycle_id=payload.pay_cycle_id,
                event_type="JOB_ENQUEUED",
                payload={"kind": SDK_VERIFICATION_JOB, "job_id": job.id},
            )
        )
        self.db.commit()
        self.db.refresh(job)
        return job

    def get_job(self, job_id: str) -> Job:
        job = self.db.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
        return job

    def process_job(self, job_id: str) -> Job:
        job = self.get_job(job_id)
        if job.status in {"COMPLETED", "FAILED"}:
            return job

        job.status = "RUNNING"
        job.updated_at = datetime.utcnow()
        self.db.commit()

        try:
            if job.kind != SDK_VERIFICATION_JOB:
                raise ValueError(f"unsupported job kind: {job.kind}")
            request = VerifyAndDisburseRequest.model_validate(job.payload)
            raw_result = SDKService(self.db).verify_and_disburse(request)
            result = VerifyAndDisburseResponse(**raw_result).model_dump(
                mode="json",
                exclude_none=True,
            )
            job.status = "COMPLETED"
            job.result = result
            job.error = None
        except Exception as exc:
            job.status = "FAILED"
            job.error = _exception_payload(exc)
        finally:
            job.completed_at = datetime.utcnow()
            job.updated_at = job.completed_at
            self.db.add(
                AuditLog(
                    worker_id=job.payload.get("worker_id"),
                    pay_cycle_id=job.payload.get("pay_cycle_id"),
                    event_type="JOB_COMPLETED",
                    payload={
                        "job_id": job.id,
                        "kind": job.kind,
                        "status": job.status,
                        "error": job.error,
                    },
                )
            )
            self.db.commit()
            self.db.refresh(job)
        return job


def process_job_in_background(job_id: str) -> None:
    db = SessionLocal()
    try:
        JobService(db).process_job(job_id)
    finally:
        db.close()


def _exception_payload(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, HTTPException):
        return {"type": "HTTPException", "status_code": exc.status_code, "detail": exc.detail}
    return {"type": exc.__class__.__name__, "detail": str(exc)}
