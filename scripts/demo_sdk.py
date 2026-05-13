from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SDK_PATH = ROOT / "sdk" / "python"
sys.path.insert(0, str(SDK_PATH))

from lattice_sdk import LatticeAPIError, LatticeClient, LatticeConnectionError  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Demo Lattice as an SDK inside an Ogun State payroll adapter.",
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8010/api/v1")
    parser.add_argument("--api-key", default=None)
    args = parser.parse_args()

    with LatticeClient(base_url=args.base_url, api_key=args.api_key) as client:
        try:
            health = client.health()
        except LatticeConnectionError:
            print(f"Could not reach Lattice API at {args.base_url}. Start the backend first.")
            return 1

        print("Lattice SDK Demo: Ogun State Ministry Staff Verification")
        print(f"API health: {health['status']} ({health['service']})")

        seed = client.seed_demo_payroll(
            count=100,
            ghost_count=5,
            seed=42,
            ministry="Ogun State Ministry of Education",
        )
        print(
            "Seeded payroll:",
            f"{seed['workers_inserted']} workers,",
            f"{seed['injected_ghost_workers']} injected ghost clusters",
        )

        anomalies = client.scan_anomalies(pay_cycle_id=seed["pay_cycle_id"])
        print(
            "Anomaly scan:",
            f"{anomalies['summary']['flagged_workers']} flagged,",
            f"recall={anomalies['summary']['recall']}",
        )
        first_flagged = next(item for item in anomalies["results"] if item["flagged"])
        print(
            "Example flagged worker:",
            first_flagged["worker_code"],
            "-", first_flagged["explanations"][0],
        )

        workers = client.list_workers(ministry=seed["ministry"], limit=100)
        clean_worker = next(
            worker for worker in workers if not worker["risk_metadata"].get("is_injected_ghost")
        )
        evidence = clean_evidence()

        viq_result = client.verify_and_disburse(
            worker_id=clean_worker["id"],
            pay_cycle_id=seed["pay_cycle_id"],
            evidence=evidence,
            initiate_transfer=False,
        )
        viq = viq_result["viq"]
        print(
            "One-call SDK verification:",
            clean_worker["worker_code"],
            f"verdict={viq['verdict']}",
            f"score={viq['trust_score']}",
            f"flags={viq['flags']}",
        )
        print(f"Signed VIQ: {viq['id']} signature={viq['signature'][:12]}...")

        queued = client.enqueue_verification(
            worker_id=clean_worker["id"],
            pay_cycle_id=seed["pay_cycle_id"],
            evidence=evidence,
            initiate_transfer=False,
        )
        job = wait_for_job(client, queued["job_id"])
        print(
            "Queued SDK verification:",
            f"job={queued['job_id']}",
            f"status={job['status']}",
            f"verdict={job['result']['viq']['verdict'] if job.get('result') else 'n/a'}",
        )

        documents = client.evaluate_document_consistency(worker_record=clean_document_record())
        print(
            "Document consistency:",
            f"status={documents['status']}",
            f"severity={documents['severity']}",
            f"flags={len(documents['flags'])}",
        )

        bias = client.run_liveness_bias_audit(
            live_cases_per_group=20,
            spoof_cases_per_group=20,
            seed=42,
        )
        print(
            "Bias audit:",
            f"groups={len(bias['groups'])}",
            f"max_fpr_gap={bias['max_fpr_gap']}",
            f"max_fnr_gap={bias['max_fnr_gap']}",
        )

        print("Payroll decision: PASS workers can be released; REVIEW/FAIL stay held.")
        return 0


def clean_evidence() -> dict[str, Any]:
    return {
        "liveness": {"status": "PASSED", "confidence": 0.96, "attempts": 1},
        "deepfake": {"status": "CLEAN", "synthetic_probability": 0.02},
        "face_match": {"status": "MATCH", "similarity": 0.98},
        "bvn": {"status": "BVN_MATCH", "provider": "SQUAD"},
        "documents": {
            "status": "DOCUMENTS_CLEAN",
            "severity": "NONE",
            "flags": [],
            "summary": "No document contradictions found.",
        },
    }


def clean_document_record() -> dict[str, Any]:
    return {
        "worker_id": "OG-MOE-04821",
        "full_name": "Adebayo Adeyemi",
        "payroll_dob": "1988-04-12",
        "bvn_dob": "1988-04-12",
        "file_dob": "1988-04-12",
        "appointment_date": "2014-09-01",
        "first_salary_date": "2014-09-30",
        "confirmation_date": "2016-09-01",
        "last_promotion_date": "2020-01-01",
        "document_numbers": {"appointment_letter": "OG/APP/001"},
        "required_documents": ["appointment_letter", "birth_certificate"],
        "submitted_documents": ["appointment_letter", "birth_certificate"],
    }


def wait_for_job(client: LatticeClient, job_id: str, *, attempts: int = 10) -> dict[str, Any]:
    for _ in range(attempts):
        job = client.get_job(job_id)
        if job["status"] in {"COMPLETED", "FAILED"}:
            return job
        time.sleep(0.5)
    return client.get_job(job_id)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LatticeAPIError as exc:
        print(f"Lattice API error: {exc}")
        raise SystemExit(1) from exc
