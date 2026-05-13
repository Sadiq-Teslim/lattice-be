# Backend Demo Runbook

This runbook is for the backend and AI portion of the Squad Hackathon build.

## 1. Start The Stack

Copy `.env.example` to `.env` and fill in real Squad credentials. Do not commit `.env`.

```powershell
docker compose up --build
```

API:

```text
http://127.0.0.1:8000
```

OpenAPI:

```text
http://127.0.0.1:8000/docs
```

## 2. Initialize Database Tables

In another terminal:

```powershell
docker compose exec api python -m app.db.init_db
```

## 3. Seed Demo Payroll

```text
POST /api/v1/demo/seed
```

Suggested body:

```json
{
  "count": 1000,
  "ghost_count": 50,
  "seed": 42,
  "ministry": "Lagos State Ministry of Education"
}
```

Save the returned `pay_cycle_id`.

## 4. Run Payroll Anomaly Scan

```text
GET /api/v1/demo/anomalies?pay_cycle_id=<pay_cycle_id>
```

Expected demo result:

- 1,000 workers scanned
- 50 workers flagged
- 50 injected ghost workers flagged
- recall on injected ghosts: 1.0

## 5. Create A Verification Session

Pick a worker ID from the database or admin tooling.

```text
POST /api/v1/verification/sessions
```

```json
{
  "worker_id": "<worker_id>",
  "pay_cycle_id": "<pay_cycle_id>"
}
```

## 6. Submit Real Evidence

The backend does not fake liveness, deepfake, or BVN results. Evidence should come from real subsystems.

For backend-only rehearsal, submit evidence only when the source system has actually produced it.

```text
POST /api/v1/verification/sessions/<session_id>/evidence
```

Example shape:

```json
{
  "liveness": {
    "status": "PASSED",
    "confidence": 0.96,
    "attempts": 1,
    "challenge": "blink_twice_turn_left"
  },
  "deepfake": {
    "status": "CLEAN",
    "synthetic_probability": 0.03,
    "model_name": "EfficientNet-B0",
    "model_version": "faceforensics-v1"
  },
  "face_match": {
    "status": "MATCH",
    "similarity": 0.94
  },
  "bvn": {
    "status": "BVN_MATCH",
    "provider": "SQUAD",
    "provider_reference": "<squad-reference>",
    "resolved_name": "Worker Legal Name",
    "matched_name": "Worker Payroll Name"
  }
}
```

If any required evidence is missing, the VIQ routes to `REVIEW`.

## 7. Finalize VIQ

```text
POST /api/v1/verification/sessions/<session_id>/finalize
```

The backend runs the real anomaly detector, computes trust score, signs the VIQ, and stores the audit event.

## One-Call SDK Flow

```text
POST /api/v1/sdk/verify-and-disburse
```

This endpoint accepts worker/pay-cycle/evidence, finalizes a VIQ, and optionally attempts Squad transfer if the VIQ passes.

Use this when presenting Lattice as an SDK for existing government payroll systems.

## Python SDK Demo

Install the local SDK:

```powershell
pip install -e sdk/python
```

Run the Ogun payroll-adapter demo:

```powershell
python scripts/demo_sdk.py --base-url http://127.0.0.1:8010/api/v1
```

This script uses the SDK client to seed an Ogun Ministry payroll cohort, run anomaly detection,
verify a clean worker, enqueue a background verification job, run document consistency, and print
bias-audit metrics.

## Queued SDK Flow

```text
POST /api/v1/jobs/sdk-verification
GET /api/v1/jobs/<job_id>
```

This stores the SDK request as a durable job and processes it in the background. It is the local
proof for async payroll-scale verification without claiming Redis is running on the demo machine.

## SMS OTP

```text
POST /api/v1/mfa/otp/send
POST /api/v1/mfa/otp/verify
```

`/otp/send` generates a six-digit OTP, stores only the hash, and sends the message through Squad.
If Squad rejects the SMS endpoint or the merchant lacks access, the app returns a real provider
failure instead of marking the challenge as sent.

## Bias Audit

```text
POST /api/v1/ai/bias-audit/liveness
POST /api/v1/ai/bias-audit/liveness/demo
```

The demo endpoint creates a deterministic synthetic Fitzpatrick IV-VI liveness cohort and returns
per-group FPR/FNR plus max group gaps. Use the output as hackathon evidence, then replace the demo
cases with field/curated cases before production.

## 8. Deepfake Inference

Model status:

```text
GET /api/v1/ai/deepfake/status
```

Classify a captured frame:

```text
POST /api/v1/ai/deepfake/classify-frame
```

Use `multipart/form-data` with a file field named `file`.

Classify multiple frames:

```text
POST /api/v1/ai/deepfake/classify-frames
```

Use `multipart/form-data` with one or more fields named `files`. The backend aggregates frame-level probabilities.

The current model is EfficientNet-B0 fine-tuned on FaceForensics++ C23:

```text
Xicor9/efficientnet-b0-ffpp-c23
```

The model file is stored locally under `models/`, which is ignored by git.

## Face Match

Model status:

```text
GET /api/v1/ai/face-match/status
```

Compare enrolled and candidate face images:

```text
POST /api/v1/ai/face-match/compare
```

Use `multipart/form-data`:

- `reference`
- `candidate`

The endpoint returns cosine similarity and either `MATCH` or `FACE_MISMATCH`.

## 9. Initiate Squad Transfer

Only `PASS` VIQs can initiate transfer.

```text
POST /api/v1/squad/transfers/viq
```

```json
{
  "viq_id": "<viq_id>",
  "bank_code": "000013",
  "account_number": "0123456789",
  "account_name": "Worker Legal Name"
}
```

The service performs Squad account lookup before transfer.

## 10. Configure Squad Webhook

For a deployed backend:

```text
https://<your-domain>/api/v1/webhooks/squad
```

For local testing, expose the API through a public tunnel and use the tunnel URL:

```text
https://<your-tunnel>/api/v1/webhooks/squad
```

In Squad dashboard:

1. Log in to the Squad dashboard.
2. Go to `Profile > API & Webhook`.
3. Paste the URL above into the Webhook URL field.
4. Save.

Squad sends `x-squad-encrypted-body`, an HMAC SHA512 signature of the raw webhook body using your secret key. The backend validates this before updating any VIQ.

## Local Runtime Proof

If Docker/Postgres is unavailable on the machine, run the local DB proof:

```powershell
python scripts/runtime_proof.py
```

This uses SQLite only for local proof and does not replace the intended PostgreSQL deployment.

Expected output includes:

- 1,000 workers inserted
- 50 injected ghosts
- 50 flagged workers
- 1.0 recall on injected ghosts
- signed `PASS` VIQ for a clean worker

## Squad Smoke Test

```powershell
python scripts/squad_smoke.py
```

This performs non-money-moving real calls against Squad sandbox. If the merchant is not eligible for transfer endpoints yet, Squad returns a real eligibility error.
