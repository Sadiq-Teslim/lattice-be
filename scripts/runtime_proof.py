from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./.runtime/lattice-proof.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.db.init_db import init_db  # noqa: E402
from app.main import app  # noqa: E402


def main() -> None:
    Path(".runtime").mkdir(exist_ok=True)
    db_path = Path(".runtime/lattice-proof.db")
    if db_path.exists():
        db_path.unlink()

    init_db()
    client = TestClient(app)

    health = client.get("/api/v1/health")
    health.raise_for_status()

    seed = client.post(
        "/api/v1/demo/seed",
        json={
            "count": 1000,
            "ghost_count": 50,
            "seed": 42,
            "ministry": "Lagos State Ministry of Education",
        },
    )
    seed.raise_for_status()
    seed_payload = seed.json()

    anomalies = client.get(
        "/api/v1/demo/anomalies",
        params={"pay_cycle_id": seed_payload["pay_cycle_id"]},
    )
    anomalies.raise_for_status()
    anomaly_payload = anomalies.json()

    workers = client.get(
        "/api/v1/workers",
        params={"ministry": seed_payload["ministry"], "limit": 1000},
    )
    workers.raise_for_status()
    worker = next(item for item in workers.json() if not item["risk_metadata"]["is_injected_ghost"])

    session = client.post(
        "/api/v1/verification/sessions",
        json={"worker_id": worker["id"], "pay_cycle_id": seed_payload["pay_cycle_id"]},
    )
    session.raise_for_status()
    session_payload = session.json()

    evidence = client.post(
        f"/api/v1/verification/sessions/{session_payload['id']}/evidence",
        json={
            "liveness": {
                "status": "PASSED",
                "confidence": 0.96,
                "attempts": 1,
                "challenge": "blink_twice_turn_left",
            },
            "deepfake": {
                "status": "CLEAN",
                "synthetic_probability": 0.03,
                "model_name": "real-model-placeholder",
                "model_version": "runtime-proof",
            },
            "face_match": {"status": "MATCH", "similarity": 0.94},
            "bvn": {
                "status": "BVN_MATCH",
                "provider": "SQUAD",
                "provider_reference": "runtime-proof",
                "resolved_name": worker["full_name"],
                "matched_name": worker["full_name"],
            },
        },
    )
    evidence.raise_for_status()

    finalize = client.post(f"/api/v1/verification/sessions/{session_payload['id']}/finalize")
    finalize.raise_for_status()
    finalize_payload = finalize.json()

    summary = {
        "health": health.json(),
        "seed": seed_payload,
        "anomaly_summary": anomaly_payload["summary"],
        "worker_code": worker["worker_code"],
        "viq": {
            "id": finalize_payload["viq"]["id"],
            "trust_score": finalize_payload["viq"]["trust_score"],
            "verdict": finalize_payload["viq"]["verdict"],
            "flags": finalize_payload["viq"]["flags"],
            "payment_status": finalize_payload["viq"]["payment_status"],
            "signature_prefix": finalize_payload["viq"]["signature"][:12],
        },
    }
    print(summary)


if __name__ == "__main__":
    main()
