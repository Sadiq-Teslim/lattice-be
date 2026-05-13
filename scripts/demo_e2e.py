from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./.runtime/lattice-demo.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.db.init_db import init_db  # noqa: E402
from app.main import app  # noqa: E402


def main() -> None:
    Path(".runtime").mkdir(exist_ok=True)
    db_path = Path(".runtime/lattice-demo.db")
    if db_path.exists():
        db_path.unlink()
    init_db()

    client = TestClient(app)
    seed = _post(
        client,
        "/api/v1/demo/seed",
        {
            "count": 1000,
            "ghost_count": 50,
            "seed": 42,
            "ministry": "Lagos State Ministry of Education",
        },
    )
    pay_cycle_id = seed["pay_cycle_id"]
    ministry = seed["ministry"]

    anomaly = _get(client, "/api/v1/demo/anomalies", {"pay_cycle_id": pay_cycle_id})
    workers = _get(client, "/api/v1/workers", {"ministry": ministry, "limit": 1000})
    clean_worker = next(
        worker for worker in workers if not worker["risk_metadata"]["is_injected_ghost"]
    )
    ghost_worker = next(
        worker for worker in workers if worker["risk_metadata"]["is_injected_ghost"]
    )

    happy_path = _run_worker_flow(
        client=client,
        worker=clean_worker,
        pay_cycle_id=pay_cycle_id,
        deepfake_status="CLEAN",
        synthetic_probability=0.03,
    )
    attack_path = _run_worker_flow(
        client=client,
        worker=ghost_worker,
        pay_cycle_id=pay_cycle_id,
        deepfake_status="DEEPFAKE_DETECTED",
        synthetic_probability=0.97,
    )

    print(
        {
            "seed": seed,
            "anomaly_summary": anomaly["summary"],
            "happy_path": {
                "worker_code": clean_worker["worker_code"],
                "trust_score": happy_path["viq"]["trust_score"],
                "verdict": happy_path["viq"]["verdict"],
                "flags": happy_path["viq"]["flags"],
                "payment_status": happy_path["viq"]["payment_status"],
            },
            "attack_path": {
                "worker_code": ghost_worker["worker_code"],
                "trust_score": attack_path["viq"]["trust_score"],
                "verdict": attack_path["viq"]["verdict"],
                "flags": attack_path["viq"]["flags"],
                "payment_status": attack_path["viq"]["payment_status"],
            },
        }
    )


def _run_worker_flow(
    *,
    client: TestClient,
    worker: dict,
    pay_cycle_id: str,
    deepfake_status: str,
    synthetic_probability: float,
) -> dict:
    session = _post(
        client,
        "/api/v1/verification/sessions",
        {"worker_id": worker["id"], "pay_cycle_id": pay_cycle_id},
    )
    _post(
        client,
        f"/api/v1/verification/sessions/{session['id']}/evidence",
        {
            "liveness": {
                "status": "PASSED",
                "confidence": 0.96,
                "attempts": 1,
                "challenge": "blink_twice_turn_left",
            },
            "deepfake": {
                "status": deepfake_status,
                "synthetic_probability": synthetic_probability,
                "model_name": "EfficientNet-B0",
                "model_version": "Xicor9/efficientnet-b0-ffpp-c23",
            },
            "face_match": {"status": "MATCH", "similarity": 0.94},
            "bvn": {
                "status": "BVN_MATCH",
                "provider": "SQUAD",
                "provider_reference": "demo-e2e",
                "resolved_name": worker["full_name"],
                "matched_name": worker["full_name"],
            },
        },
    )
    return _post(client, f"/api/v1/verification/sessions/{session['id']}/finalize", {})


def _post(client: TestClient, path: str, payload: dict) -> dict:
    response = client.post(path, json=payload)
    response.raise_for_status()
    return response.json()


def _get(client: TestClient, path: str, params: dict) -> dict | list:
    response = client.get(path, params=params)
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    main()
