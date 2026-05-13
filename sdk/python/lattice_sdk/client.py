from typing import Any

import httpx

from lattice_sdk.errors import LatticeAPIError, LatticeConnectionError
from lattice_sdk.types import (
    PayCyclePayload,
    TransferPayload,
    VerificationEvidence,
    WorkerPayload,
)


class LatticeClient:
    """Small client for integrating Lattice into payroll systems."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client = httpx.Client(timeout=timeout, transport=transport)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "LatticeClient":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/health")

    def verify_and_disburse(
        self,
        *,
        evidence: VerificationEvidence,
        worker_id: str | None = None,
        worker: WorkerPayload | None = None,
        pay_cycle_id: str | None = None,
        pay_cycle: PayCyclePayload | None = None,
        initiate_transfer: bool = False,
        transfer: TransferPayload | None = None,
    ) -> dict[str, Any]:
        payload = {
            "worker_id": worker_id,
            "worker": worker,
            "pay_cycle_id": pay_cycle_id,
            "pay_cycle": pay_cycle,
            "evidence": evidence,
            "initiate_transfer": initiate_transfer,
            "transfer": transfer,
        }
        return self._request("POST", "/sdk/verify-and-disburse", json=_without_none(payload))

    def enqueue_verification(
        self,
        *,
        evidence: VerificationEvidence,
        worker_id: str | None = None,
        worker: WorkerPayload | None = None,
        pay_cycle_id: str | None = None,
        pay_cycle: PayCyclePayload | None = None,
        initiate_transfer: bool = False,
        transfer: TransferPayload | None = None,
    ) -> dict[str, Any]:
        request = {
            "worker_id": worker_id,
            "worker": worker,
            "pay_cycle_id": pay_cycle_id,
            "pay_cycle": pay_cycle,
            "evidence": evidence,
            "initiate_transfer": initiate_transfer,
            "transfer": transfer,
        }
        return self._request(
            "POST",
            "/jobs/sdk-verification",
            json={"request": _without_none(request)},
        )

    def get_job(self, job_id: str) -> dict[str, Any]:
        return self._request("GET", f"/jobs/{job_id}")

    def send_otp(
        self,
        *,
        worker_id: str,
        pay_cycle_id: str | None = None,
        purpose: str = "PAYROLL_VERIFICATION",
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/mfa/otp/send",
            json=_without_none(
                {
                    "worker_id": worker_id,
                    "pay_cycle_id": pay_cycle_id,
                    "purpose": purpose,
                }
            ),
        )

    def verify_otp(self, *, challenge_id: str, otp: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/mfa/otp/verify",
            json={"challenge_id": challenge_id, "otp": otp},
        )

    def get_viq(self, viq_id: str) -> dict[str, Any]:
        return self._request("GET", f"/viq/{viq_id}")

    def list_viqs(self, *, pay_cycle_id: str | None = None, worker_id: str | None = None) -> list:
        params = _without_none({"pay_cycle_id": pay_cycle_id, "worker_id": worker_id})
        return self._request("GET", "/viq", params=params)

    def create_pay_cycle(self, *, name: str, ministry: str) -> dict[str, Any]:
        return self._request("POST", "/pay-cycles", json={"name": name, "ministry": ministry})

    def list_pay_cycles(self, *, ministry: str | None = None) -> list:
        return self._request("GET", "/pay-cycles", params=_without_none({"ministry": ministry}))

    def create_worker(self, worker: WorkerPayload) -> dict[str, Any]:
        return self._request("POST", "/workers", json=worker)

    def list_workers(
        self,
        *,
        ministry: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list:
        params = _without_none({"ministry": ministry, "limit": limit, "offset": offset})
        return self._request("GET", "/workers", params=params)

    def scan_anomalies(self, *, pay_cycle_id: str, contamination: float = 0.05) -> dict[str, Any]:
        return self._request(
            "GET",
            "/demo/anomalies",
            params={"pay_cycle_id": pay_cycle_id, "contamination": contamination},
        )

    def seed_demo_payroll(
        self,
        *,
        count: int = 1000,
        ghost_count: int = 50,
        seed: int = 42,
        ministry: str = "Ogun State Ministry of Education",
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/demo/seed",
            json={
                "count": count,
                "ghost_count": ghost_count,
                "seed": seed,
                "ministry": ministry,
            },
        )

    def run_liveness_bias_audit(
        self,
        *,
        live_cases_per_group: int = 40,
        spoof_cases_per_group: int = 40,
        seed: int = 42,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/ai/bias-audit/liveness/demo",
            json={
                "live_cases_per_group": live_cases_per_group,
                "spoof_cases_per_group": spoof_cases_per_group,
                "seed": seed,
            },
        )

    def evaluate_document_consistency(
        self,
        *,
        worker_record: dict[str, Any],
        cohort_records: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/ai/document-consistency/evaluate",
            json=_without_none(
                {"worker_record": worker_record, "cohort_records": cohort_records}
            ),
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        headers = {
            "Accept": "application/json",
            "User-Agent": "lattice-python-sdk/0.1.0",
        }
        if self.api_key:
            headers["X-Lattice-API-Key"] = self.api_key
        headers.update(kwargs.pop("headers", {}))

        try:
            response = self._client.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                **kwargs,
            )
        except httpx.HTTPError as exc:
            raise LatticeConnectionError(str(exc)) from exc

        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise LatticeAPIError(
                status_code=response.status_code,
                detail=detail,
                response_text=response.text,
            )

        if not response.content:
            return None
        return response.json()


def _without_none(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}
