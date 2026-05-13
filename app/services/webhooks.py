import json
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import sign_payload
from app.db.models import VIQ, AuditLog


class SquadWebhookService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def apply_event(self, payload: dict[str, Any]) -> VIQ | None:
        transaction_reference = extract_transaction_reference(payload)
        if not transaction_reference:
            return None

        viq = (
            self.db.query(VIQ)
            .filter(VIQ.squad_transaction_reference == str(transaction_reference))
            .one_or_none()
        )
        if viq is None:
            return None

        viq.payment_status = _payment_status_from_webhook(payload)
        viq.signed_payload = {
            **viq.signed_payload,
            "payment_status": viq.payment_status,
            "squad_webhook": _json_safe(payload),
        }
        viq.signature = sign_payload(viq.signed_payload, settings.viq_signing_secret)
        self.db.add(
            AuditLog(
                worker_id=viq.worker_id,
                pay_cycle_id=viq.pay_cycle_id,
                event_type="SQUAD_WEBHOOK_APPLIED",
                payload={"viq_id": viq.id, "webhook": _json_safe(payload)},
            )
        )
        self.db.commit()
        self.db.refresh(viq)
        return viq


def _payment_status_from_webhook(payload: dict[str, Any]) -> str:
    body = payload.get("Body") if isinstance(payload.get("Body"), dict) else {}
    status = str(
        payload.get("transaction_status")
        or payload.get("status")
        or body.get("transaction_status")
        or body.get("status")
        or ""
    ).upper()
    if status in {"SUCCESS", "SUCCESSFUL", "200"}:
        return "PAID_AND_VERIFIED"
    if status in {"FAILED", "FAILURE", "REVERSED"}:
        return "PAYMENT_FAILED"
    return "WEBHOOK_RECEIVED"


def _json_safe(payload: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(payload, default=str))


def extract_transaction_reference(payload: dict[str, Any]) -> str | None:
    body = payload.get("Body") if isinstance(payload.get("Body"), dict) else {}
    value = (
        payload.get("transaction_reference")
        or payload.get("TransactionRef")
        or payload.get("transaction_ref")
        or body.get("transaction_reference")
        or body.get("transaction_ref")
        or body.get("TransactionRef")
    )
    if value is None:
        return None
    return str(value)
