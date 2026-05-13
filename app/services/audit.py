from sqlalchemy.orm import Session

from app.db.models import AuditLog


class AuditService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def log(
        self,
        *,
        event_type: str,
        payload: dict,
        worker_id: str | None = None,
        pay_cycle_id: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            worker_id=worker_id,
            pay_cycle_id=pay_cycle_id,
            event_type=event_type,
            payload=payload,
        )
        self.db.add(entry)
        return entry

