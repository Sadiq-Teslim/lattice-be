# Lattice / TrustAnchor

AI-powered proof-of-life payroll verification engine for Squad Hackathon 3.0.

The backend verifies government workers before salary release by combining liveness evidence, synthetic-media checks, payroll anomaly detection, BVN verification, and Squad payment gating into a signed Verifiable Institutional Quote (VIQ).

## What It Does

Lattice verifies government workers before salary release by combining:

- liveness evidence
- deepfake detection
- payroll anomaly detection
- Squad identity/payment infrastructure
- signed VIQ audit records

Verdicts:

- `PASS`
- `REVIEW`
- `FAIL`

## Current Build Status

Implemented:

- FastAPI app scaffold
- PostgreSQL database wiring
- core payroll verification models
- health endpoints
- Docker runtime files
- synthetic payroll generator
- Isolation Forest anomaly detector
- trust score engine
- signed VIQ generation
- Squad integration wrapper
- Squad webhook validation
- EfficientNet-B0 deepfake endpoint
- liveness result contract
- document consistency engine
- face-match embedding comparison
- signed offline liveness cache/sync
- one-call SDK `verify-and-disburse` endpoint
- installable Python SDK package under `sdk/python`
- Squad-backed SMS OTP/MFA endpoints
- liveness bias-audit metrics endpoint
- numeric anomaly feature contribution explanations
- persistent queued SDK verification jobs
- worker/pay-cycle/VIQ APIs

External integrations are not mocked. Squad credentials are expected to be configured before live integration endpoints are used.

## Local Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
uvicorn app.main:app --reload
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

## Local Proof Scripts

```powershell
python scripts/runtime_proof.py
python scripts/demo_e2e.py
python scripts/demo_sdk.py
python scripts/squad_smoke.py
```

`runtime_proof.py` uses SQLite only when Docker/Postgres is unavailable locally. PostgreSQL remains the intended deployment database.

## Endpoint Tester

Open this file in a browser:

```text
tools/endpoint-tester/index.html
```

It tests non-Squad endpoints against `http://127.0.0.1:8010/api/v1` by default.

## Python SDK

Install the local SDK:

```powershell
pip install -e sdk/python
```

Use it from an existing payroll system:

```python
from lattice_sdk import LatticeClient

client = LatticeClient(base_url="http://127.0.0.1:8010/api/v1")
result = client.verify_and_disburse(
    worker_id="worker-id",
    pay_cycle_id="pay-cycle-id",
    evidence={
        "liveness": {"status": "PASSED", "confidence": 0.96, "attempts": 1},
        "deepfake": {"status": "CLEAN", "synthetic_probability": 0.02},
        "face_match": {"status": "MATCH", "similarity": 0.98},
        "bvn": {"status": "BVN_MATCH", "provider": "SQUAD"},
    },
)
print(result["viq"]["verdict"])
```

## Liveness Client

Open this file in a browser:

```text
tools/liveness-client/index.html
```

It runs MediaPipe Face Landmarker in the browser, tracks blink/head-turn challenge metrics, and submits the liveness result to the backend.
If the backend is unavailable, it signs the payload with a browser-generated ECDSA key, stores it in IndexedDB, and syncs later.

## Key Docs

- `docs/demo-runbook.md`
- `docs/squad-integration.md`
- `docs/ai-and-fairness.md`
- `docs/identity-bvn.md`
- `docs/document-consistency.md`
- `docs/judging-alignment.md`
