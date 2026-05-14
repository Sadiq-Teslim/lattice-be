from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import AuditLog, Worker
from app.services.squad import SquadAPIError, SquadConfigurationError, SquadService


class SquadIdentityVerifier:
    def __init__(self, db: Session, squad: SquadService | None = None) -> None:
        self.db = db
        self.squad = squad

    def verify_worker_bvn(self, worker: Worker) -> dict[str, Any] | None:
        """Validate worker identity through Squad's B2C virtual-account flow.

        Squad's public docs do not expose a standalone BVN lookup for this build.
        Creating a virtual account with BVN, DOB, gender, phone, and beneficiary
        account is the documented path that validates the worker's identity bundle.
        """
        if worker.virtual_account_number:
            return self._match_evidence(
                worker=worker,
                provider_reference=worker.virtual_account_number,
            )

        required_fields = self._required_fields(worker)
        missing = [field for field, value in required_fields.items() if not value]
        if missing:
            self._audit(
                worker=worker,
                event_type="SQUAD_BVN_VALIDATION_SKIPPED",
                payload={
                    "worker_code": worker.worker_code,
                    "missing_fields": missing,
                    "reason": "missing identity fields required by virtual-account validation",
                },
            )
            return None

        try:
            first_name, last_name, middle_name = split_name(worker.full_name)
            squad = self.squad or SquadService()
            response = squad.create_virtual_account(
                customer_identifier=worker.worker_code,
                first_name=first_name,
                last_name=last_name,
                middle_name=middle_name,
                mobile_num=worker.phone,
                email=str(worker.email),
                bvn=worker.bvn,
                dob=normalize_dob(str(worker.date_of_birth)),
                gender=str(worker.gender),
                address=str(worker.address),
                beneficiary_account=str(worker.bank_account_number),
            )
        except (ValueError, SquadConfigurationError) as exc:
            self._audit(
                worker=worker,
                event_type="SQUAD_BVN_VALIDATION_SKIPPED",
                payload={
                    "worker_code": worker.worker_code,
                    "reason": str(exc),
                },
            )
            return None
        except SquadAPIError as exc:
            self._audit(
                worker=worker,
                event_type="SQUAD_BVN_VALIDATION_FAILED",
                payload={
                    "worker_code": worker.worker_code,
                    "message": str(exc),
                    "squad_response": exc.response,
                },
            )
            if _looks_like_identity_mismatch(exc):
                return self._mismatch_evidence(worker=worker, response=exc.response)
            return None

        data = response.get("data") if isinstance(response.get("data"), dict) else {}
        virtual_account_number = data.get("virtual_account_number")
        if virtual_account_number:
            worker.virtual_account_number = str(virtual_account_number)
        self._audit(
            worker=worker,
            event_type="SQUAD_VIRTUAL_ACCOUNT_CREATED",
            payload={
                "worker_code": worker.worker_code,
                "virtual_account_number": virtual_account_number,
                "customer_identifier": worker.worker_code,
                "squad_response": response,
            },
        )
        self.db.commit()
        self.db.refresh(worker)
        return self._match_evidence(
            worker=worker,
            provider_reference=str(virtual_account_number or worker.worker_code),
        )

    def _required_fields(self, worker: Worker) -> dict[str, Any]:
        return {
            "full_name": worker.full_name,
            "bvn": worker.bvn,
            "phone": worker.phone,
            "email": worker.email,
            "date_of_birth": worker.date_of_birth,
            "gender": worker.gender,
            "address": worker.address,
            "bank_account_number": worker.bank_account_number,
        }

    def _match_evidence(self, *, worker: Worker, provider_reference: str) -> dict[str, Any]:
        return {
            "status": "BVN_MATCH",
            "provider": "SQUAD",
            "provider_reference": provider_reference,
            "resolved_name": worker.full_name,
            "matched_name": worker.full_name,
            "captured_at": datetime.utcnow().isoformat(),
        }

    def _mismatch_evidence(
        self,
        *,
        worker: Worker,
        response: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return {
            "status": "BVN_MISMATCH",
            "provider": "SQUAD",
            "provider_reference": worker.worker_code,
            "resolved_name": _response_message(response),
            "matched_name": worker.full_name,
            "captured_at": datetime.utcnow().isoformat(),
        }

    def _audit(self, *, worker: Worker, event_type: str, payload: dict[str, Any]) -> None:
        self.db.add(
            AuditLog(
                worker_id=worker.id,
                pay_cycle_id=None,
                event_type=event_type,
                payload=payload,
            )
        )
        self.db.commit()


def split_name(full_name: str) -> tuple[str, str, str | None]:
    parts = full_name.strip().split()
    if len(parts) < 2:
        raise ValueError("worker full_name must include at least first and last name")
    first_name = parts[0]
    last_name = parts[-1]
    middle_name = " ".join(parts[1:-1]) or None
    return first_name, last_name, middle_name


def normalize_dob(value: str) -> str:
    cleaned = value.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(cleaned, fmt).strftime("%m/%d/%Y")
        except ValueError:
            continue
    return cleaned


def _looks_like_identity_mismatch(exc: SquadAPIError) -> bool:
    text = f"{exc} {exc.response or ''}".lower()
    identity_terms = ("bvn", "date of birth", "dob", "name", "identity", "customer")
    mismatch_terms = ("mismatch", "invalid", "does not match", "failed", "not match")
    return any(term in text for term in identity_terms) and any(
        term in text for term in mismatch_terms
    )


def _response_message(response: dict[str, Any] | None) -> str | None:
    if not response:
        return None
    message = response.get("message")
    return str(message) if message else None
