# Squadco Hackathon Context: Lattice / TrustAnchor

## Current State

The repository started from scratch. Backend, SDK, AI, and the Ogun HR console now exist.

Latest update, 2026-05-14:

- BVN verification is not implemented as a standalone Squad BVN lookup. The documented path in this repo is Squad B2C virtual-account creation, which validates BVN against supplied identity fields.
- `/api/v1/sdk/verify-and-disburse` now attempts that Squad virtual-account identity validation automatically before VIQ finalization when BVN evidence is not already supplied.
- The payroll UI no longer treats bank-account lookup as BVN proof. Account lookup remains financial-account evidence only.
- Real Squad BVN validation requires complete worker identity fields: full name, BVN, phone, email, DOB, gender, address, and beneficiary bank account number.
- Teslim's seeded staff record uses real BVN/bank details from local `.env`, but real BVN validation still needs `DEMO_TESLIM_DOB` set to the actual DOB. Do not invent this value.
- Payroll verification does not use the live camera directly. Camera/liveness belongs to manual worker verification or verification-exercise submissions; payroll verification consumes already-captured/preverified evidence plus Squad/document/anomaly checks.
- Local backend is on `http://127.0.0.1:8010`; Ogun HR console is on `http://127.0.0.1:3011/admin/ogun-education`; Lattice landing page is on port `3010`.

Implemented so far:

- FastAPI app scaffold
- PostgreSQL SQLAlchemy models
- health routes
- Docker runtime files
- synthetic payroll generator
- Isolation Forest anomaly detector
- demo seed/anomaly API routes
- trust score engine
- HMAC VIQ payload signing
- audit service
- verification orchestration service
- verification session/evidence/finalize API routes
- VIQ lookup route
- scoring, signing, and anomaly tests
- real Squad service wrapper
- Squad account lookup route
- Squad worker virtual-account creation route
- Squad VIQ transfer route
- Squad webhook validation route
- Squad integration notes in `docs/squad-integration.md`
- backend demo runbook in `docs/demo-runbook.md`
- worker CRUD/list APIs
- pay-cycle CRUD/list/status APIs
- VIQ list API
- root `README.md`, `.env.example`, and `pyproject.toml`

Verification completed:

- Python compile passes.
- Ruff lint passes.
- FastAPI `/api/v1/health` passes through `TestClient`.
- Direct anomaly scan validation passes: 1,000 workers, 50 injected ghosts, 50 flagged, 100% recall.
- Pytest passes: 11 tests.
- Local `.env` has been created with Squad sandbox credentials and merchant ID. Do not commit it.
- OutRay tunnel is active for this machine at `https://uncompassionate-port.outray.app`.
- Squad webhook URL for the active tunnel is `https://uncompassionate-port.outray.app/api/v1/webhooks/squad`.
- Local DB-backed proof succeeded via SQLite fallback: 1,000 workers, 50 ghosts, 50 flagged, 1.0 recall, signed clean-worker VIQ.
- PostgreSQL-backed proof is still blocked on this machine because Docker, `psql`, and `postgres` are unavailable.
- Real Squad smoke reached Squad sandbox. Account lookup currently returns `Merchant not eligible to use this endpoint`.
- Deepfake endpoint is live with EfficientNet-B0 FF++ C23 weights.
- Deepfake inference now includes OpenCV face crop, full-frame fallback, horizontal-flip TTA, and multi-frame aggregation.
- Anomaly output now includes precision, recall, F1, false positives, false negatives, and false-positive rate.
- Document consistency engine is implemented for annual staff verification.
- Face-match embedding comparison is implemented at `/api/v1/ai/face-match/*`.
- Offline liveness cache now signs payloads in-browser with ECDSA P-256, stores in IndexedDB, and syncs through `/api/v1/ai/liveness/sync`.
- One-call SDK endpoint is implemented at `/api/v1/sdk/verify-and-disburse`.
- Installable Python SDK package is implemented under `sdk/python`; demo script is `scripts/demo_sdk.py`.
- Squad-backed SMS OTP/MFA is implemented at `/api/v1/mfa/otp/send` and `/api/v1/mfa/otp/verify`. The OTP is hashed locally and sent through the real Squad SMS endpoint; provider failure is returned clearly.
- Liveness bias-audit metrics are implemented at `/api/v1/ai/bias-audit/liveness` and `/api/v1/ai/bias-audit/liveness/demo`.
- Anomaly output now includes numeric feature contribution explanations with method `robust_zscore_contribution`.
- Persistent queued SDK verification jobs are implemented at `/api/v1/jobs/sdk-verification` and `/api/v1/jobs/{job_id}`.
- Liveness browser client, backend contract, and evaluator are implemented.
- E2E demo script succeeds: clean worker PASS, attack worker FAIL.

Verification not completed in this environment:

- Docker/Postgres-backed route execution, because Docker is not installed/available in the current shell.

Original docs:

- `docs/Challenge Guide Book.pdf`
- `docs/TrustAnchor PRD v2 Tier1.docx`
- `docs/other_instructions_and_details.md`

The project is for Squad Hackathon 3.0, Challenge 01: Proof of Life.

## Product Summary

Build Lattice, also referred to in the PRD as TrustAnchor: an AI-powered ghost worker detection and salary-release system for Nigerian government payrolls.

The system verifies that a government employee is real, alive, not synthetic, not anomalous in the payroll dataset, and identity-matched through Squad BVN verification before salary payment is released through Squad.

Core output:

- A Verifiable Institutional Quote (VIQ)
- Signed JSON per worker per pay cycle
- Contains trust score, verdict, risk flags, Squad transaction reference, payment status, and audit timestamps

## Hackathon Judging Priorities

The build should optimize for a stable 5-minute demo and judging rubric alignment.

Primary scoring pillars:

1. AI Technical Depth
   - Liveness detection
   - Deepfake/synthetic face detection
   - Payroll anomaly detection

2. Squad API Integration
   - BVN verification
   - SMS notification or OTP
   - Reserved virtual accounts
   - Transfers
   - Webhooks

3. Problem Relevance
   - Ghost workers in Nigerian government payroll
   - Kaduna 2015 biometric audit recovered about NGN 36.5B annually
   - Lagos 2011 audit found 5,070 ghost workers
   - Target user: Ministry/agency HR payroll administrator

4. Scalability
   - Works as a payroll verification gateway/API
   - Designed for ministries, schools, agencies, and local governments
   - Audit records persist per worker per pay cycle

5. Responsible AI / Impact
   - Explainable flags
   - Bias and false-positive handling
   - Human review path for uncertain cases

## Recommended Scope For This Repo

For now, focus on backend and AI only. Frontend is out of scope for the current phase.

Backend stack:

- Python
- FastAPI
- PostgreSQL
- Redis, optional for hackathon but useful for sessions/jobs
- SQLAlchemy or SQLModel
- Alembic if time permits
- Pydantic settings
- Docker Compose

AI/data stack:

- scikit-learn for Isolation Forest
- pandas/numpy for synthetic payroll data
- optional SHAP if setup is smooth; otherwise return feature contribution explanations manually
- real deepfake endpoint using an actual model/inference pipeline; do not replace this with deterministic demo behavior
- liveness result accepted from client/demo payload for now; frontend/mobile can later produce MediaPipe result

## Core User Flow

1. Admin creates a pay cycle.
2. Backend creates verification sessions for workers.
3. Worker receives Squad SMS or simulated SMS.
4. Worker submits liveness result and captured face evidence.
5. Backend runs deepfake/synthetic-media check.
6. Backend runs anomaly detection against payroll cohort.
7. Backend calls Squad BVN verification using real sandbox credentials.
8. Backend computes trust score and verdict.
9. Backend creates and signs VIQ.
10. If verdict is PASS and score >= 80, backend initiates Squad transfer.
11. Squad webhook updates VIQ/payment status to PAID_AND_VERIFIED.
12. Review/fail cases remain blocked with audit flags.

## Trust Score Rules

Start at 100.

Suggested deductions:

- LIVENESS_FAIL: -40 and hard block after three attempts
- DEEPFAKE_DETECTED: -50 and hard block
- FACE_MISMATCH: -30
- ANOMALY_FLAGGED: -20
- BVN_MISMATCH: -25

Verdicts:

- PASS: score >= 80 and no hard flags
- REVIEW: score 50-79 or isolated BVN/name issue
- FAIL: score < 50 or any hard block flag

Hard block flags:

- DEEPFAKE_DETECTED
- LIVENESS_FAIL after max attempts

## Core Backend Modules

Recommended package layout:

```text
app/
  main.py
  api/
    routes/
      health.py
      workers.py
      pay_cycles.py
      verification.py
      viq.py
      webhooks.py
      demo.py
  core/
    config.py
    security.py
    scoring.py
  db/
    session.py
    models.py
    seed.py
  schemas/
    worker.py
    pay_cycle.py
    verification.py
    viq.py
  services/
    squad.py
    viq.py
    audit.py
    verification_orchestrator.py
  ai/
    anomaly.py
    deepfake.py
    liveness.py
    synthetic_data.py
  tests/
```

## Minimal Database Entities

Worker:

- id
- worker_code
- full_name
- bvn
- phone
- ministry
- department
- salary_amount
- device_id
- gps_lat
- gps_lng
- registration_ip
- registration_timestamp
- virtual_account_number
- status

PayCycle:

- id
- name
- ministry
- status
- started_at
- closed_at

VerificationSession:

- id
- worker_id
- pay_cycle_id
- session_token
- status
- liveness_status
- deepfake_status
- anomaly_status
- bvn_status
- attempts
- created_at
- completed_at

VIQ:

- id
- worker_id
- pay_cycle_id
- session_id
- trust_score
- verdict
- flags
- signed_payload
- signature
- squad_transaction_reference
- payment_status
- created_at
- updated_at

AuditLog:

- id
- worker_id
- pay_cycle_id
- event_type
- payload
- created_at

## Important API Endpoints

Health:

- `GET /health`

Workers:

- `POST /workers`
- `GET /workers`
- `GET /workers/{worker_id}`
- `POST /workers/import-demo`

Pay cycles:

- `POST /pay-cycles`
- `GET /pay-cycles`
- `POST /pay-cycles/{cycle_id}/start`

Verification:

- `POST /verification/sessions`
- `POST /verification/{session_id}/submit-liveness`
- `POST /verification/{session_id}/run`
- `GET /verification/{session_id}`

VIQ:

- `GET /viq/{viq_id}`
- `GET /viq/by-worker/{worker_id}`
- `GET /viq/by-cycle/{cycle_id}`

Demo:

- `POST /demo/seed`
- `POST /demo/run-worker/{worker_id}`
- `POST /demo/run-cycle/{cycle_id}`
- `GET /demo/anomalies`
- `POST /demo/deepfake-attack`
- `POST /demo/happy-path`

Webhooks:

- `POST /webhooks/squad`

MFA:

- `POST /mfa/otp/send`
- `POST /mfa/otp/verify`

Bias audit:

- `POST /ai/bias-audit/liveness`
- `POST /ai/bias-audit/liveness/demo`

Jobs:

- `POST /jobs/sdk-verification`
- `GET /jobs/{job_id}`

Python SDK:

- package path: `sdk/python`
- install locally with `pip install -e sdk/python`
- demo script: `python scripts/demo_sdk.py --base-url http://127.0.0.1:8010/api/v1`
- main class: `lattice_sdk.LatticeClient`

## AI Implementation Strategy

Build in layers:

1. Synthetic payroll generator
   - Generate 1,000 workers.
   - Inject 50 ghost/anomalous workers.
   - Ghost features include shared device IDs, same GPS clusters, repeated BVNs, same IP subnet, suspicious registration timestamp bursts.

2. Isolation Forest anomaly detector
   - Features:
     - device_id_frequency
     - gps_cluster_density or distance-to-cluster
     - registration_timestamp_delta
     - bvn_collision_count
     - ip_subnet_overlap
   - Return:
     - anomaly score
     - boolean flagged
     - explanation list

3. Liveness
   - Backend should accept a signed or structured result:
     - `PASSED` / `FAILED`
     - confidence
     - challenge type
     - attempts
   - Do not block backend progress waiting for frontend MediaPipe.

4. Deepfake
   - Implement a real inference path.
   - Preferred version: PyTorch EfficientNet-B0 binary classifier endpoint.
   - If model weights are not available yet, keep the endpoint unavailable with a clear error instead of returning fabricated results.

5. Trust score
   - Centralize scoring in `app/core/scoring.py`.
   - Keep score rules transparent for judges.

## Squad Integration Strategy

Create `SquadService` with sandbox-first methods:

- `send_sms(phone, message)`
- `verify_bvn(bvn)`
- `create_virtual_account(worker)`
- `initiate_transfer(worker, amount, viq_reference)`
- `verify_webhook_signature(headers, body)`

Use environment variables:

- `SQUAD_BASE_URL`
- `SQUAD_SECRET_KEY`
- `SQUAD_PUBLIC_KEY`
- `SQUAD_WEBHOOK_SECRET`

Do not mock Squad or any other external integration. If real sandbox credentials are unavailable, integration endpoints should fail clearly with configuration errors. The demo should use real Squad sandbox calls once credentials are supplied.

Official Squad docs checked:

- Sandbox base URL: `https://sandbox-api-d.squadco.com`
- Production base URL: `https://api-d.squadco.com`
- Auth header: `Authorization: Bearer <secret_key>`
- Virtual account creation uses `/virtual-account`
- Transfer APIs use payout endpoints such as `/payout/account/lookup` and `/payout/transfer`
- Webhook validation uses Squad signature headers such as `x-squad-signature` and/or encrypted body validation depending on product flow
- Signature validation docs specify HMAC SHA512 in `x-squad-encrypted-body`.
- The public docs do not show a standalone BVN verification endpoint. Treat BVN validation as part of documented B2C virtual account creation.
- Webhook setup is done in Squad dashboard under `Profile > API & Webhook`.
- Local webhook testing requires a public tunnel URL such as `https://<tunnel>/api/v1/webhooks/squad`.

Important: do not commit Squad keys. Keep them only in local `.env`.

## Build Order

Phase 1: Backend skeleton

- FastAPI app
- config
- health route
- database models
- Docker Compose
- seed command

Phase 2: Data and anomaly AI

- synthetic payroll generator
- Isolation Forest training/scoring
- anomaly explanation output
- demo dataset endpoint

Phase 3: Verification orchestrator

- liveness input handling
- deepfake input handling
- Squad BVN resolution
- trust scoring
- VIQ generation/signing
- audit log writes

Phase 3 status:

- Implemented trust scoring.
- Implemented VIQ signing.
- Implemented audit logging service.
- Implemented verification session creation, evidence submission, and finalization.
- Finalization runs the real anomaly detector.
- Missing liveness, deepfake, or BVN evidence routes the VIQ to `REVIEW`; it is not treated as a pass.
- Squad payment is not initiated in Phase 3.

Phase 4: Squad payment path

- virtual account creation
- transfer initiation
- webhook receiver
- payment status update

Phase 4 status:

- Implemented `SquadService` for real API calls.
- Implemented `/api/v1/squad/account-lookup`.
- Implemented `/api/v1/squad/virtual-accounts/workers`.
- Implemented `/api/v1/squad/transfers/viq`.
- Implemented `/api/v1/webhooks/squad`.
- Implemented HMAC SHA512 webhook validation.
- Hardened webhook parsing for Squad's documented `TransactionRef` and nested `Body.transaction_ref` shape.
- Implemented transfer gating: only `PASS` VIQs can initiate payment.
- Missing Squad config returns a clear 503 instead of fake success.
- No real Squad network call was run in this environment.

Phase 5 status:

- Added local `.env` credentials supplied by the user.
- Added webhook setup instructions.
- Added `docs/demo-runbook.md`.
- Added tests for documented Squad webhook transaction-reference shape.

Phase 6 status:

- Added `/api/v1/workers`.
- Added `/api/v1/pay-cycles`.
- Added `/api/v1/viq` listing.
- Restarted the local API on port `8010`.
- Confirmed tunnel health through OutRay.

Phase 7 status:

- Added `/api/v1/ai/liveness/evaluate`.
- Added `tools/liveness-client/index.html` using MediaPipe Face Landmarker.
- Added `/api/v1/ai/document-consistency/evaluate`.
- Added `docs/document-consistency.md`.
- Added `scripts/demo_e2e.py`.
- Added `docs/identity-bvn.md`.
- Added `docs/ai-and-fairness.md`.
- Added `docs/judging-alignment.md`.
- Expanded `README.md`.
- E2E output: clean worker score 100 PASS; attack worker score 30 FAIL with `DEEPFAKE_DETECTED` and `ANOMALY_FLAGGED`.

AI/model status:

- The anomaly detector is real ML using Isolation Forest and fits the payroll cohort without labels.
- Liveness is expected to come from a real MediaPipe client-side component; backend currently stores and scores the evidence.
- Deepfake detection now has a real model-backed inference component using EfficientNet-B0 trained on FaceForensics++ C23.
- Do not overclaim forensic readiness. The model card says it is for research/academic use.
- We do not need to train every model from scratch. For hackathon speed, use pretrained MediaPipe for liveness, unsupervised Isolation Forest for payroll anomalies, and either a pretrained/fine-tuned deepfake detector or a small fine-tuned EfficientNet model with disclosed evaluation.

Phase 5: Demo hardening

- one-command seed
- one-command happy path
- one-command deepfake blocked path
- one-command anomaly scan
- clean OpenAPI docs
- README with setup, architecture, and judging alignment

## Demo Path To Optimize

The five-minute demo should prove these moments:

1. Seed 1,000-worker payroll dataset.
2. Show anomaly scan catches injected ghost clusters.
3. Run a clean worker:
   - liveness pass
   - deepfake clean
   - BVN match
   - trust score around 94
   - transfer initiated
   - webhook marks PAID_AND_VERIFIED
4. Run an attack worker:
   - deepfake detected or liveness failed
   - trust score drops
   - payment blocked
   - VIQ contains clear flags
5. Show audit trail.

## Accuracy Principles

- Keep AI claims honest.
- Do not mock external services or claim a call succeeded unless it actually succeeded.
- Do not claim real biometric accuracy without evaluation.
- Make anomaly detection real because it is achievable quickly and impresses judges.
- Make Squad integration structurally real and require valid sandbox credentials for live calls.
- Keep every decision auditable through VIQ and AuditLog.

## Next Best Task

Start implementation with:

1. FastAPI project scaffold.
2. Docker Compose for API, Postgres, and Redis.
3. Database models.
4. Synthetic payroll generator.
5. Isolation Forest anomaly service.

This creates the foundation for everything else and gives an early demo artifact.
