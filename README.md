# Lattice

AI-powered verification infrastructure for institutions that need to confirm a real person, valid records, and a trusted decision before granting access, approval, or payment.

Built for **Squad Hackathon 3.0 — Challenge 01: Proof of Life**.

## What Lattice Is

Lattice is a verification SDK and demo payroll system that helps institutions automate staff verification, proof of life, document consistency checks, payroll risk analysis, and credit-gated verification workflows.

The core output is a **Verifiable Institutional Quote (VIQ)**: a signed JSON decision containing a trust score, verdict, risk flags, evidence summary, and audit trail.

Verdicts are simple:

- `PASS`: worker can proceed.
- `REVIEW`: HR should inspect the case.
- `FAIL`: access, approval, or payment should be blocked.

## Problem Statement

Institutions still rely on slow manual verification exercises to confirm staff identity, employment records, documents, and proof of life.

Our research focused on Ogun State education payroll verification. Teslim spoke with his mother, a serving Ogun State teacher, and with Mrs. Idowu Saka, Zonal Secretary of Odeda Local Government under Ogun State Ministry of Education.

The issue was clear:

- Genuine teachers are forced to travel for stressful physical verification exercises.
- Large local government areas can have thousands of staff to verify in a short period.
- Departed, emigrated, and deceased staff can remain on payroll.
- Inconsistent ages and conflicting documents can allow people to stay in service longer than they should.
- HR teams need verification, but workers need the process to be simple and dignified.

The same pattern appears across payroll, pensions, scholarships, grants, contractor onboarding, and other institutional approval workflows.

## Solution

Lattice turns verification into a plug-and-play trust layer.

An institution can integrate the SDK or use the provided payroll UI to:

1. Create a verification exercise.
2. Define required checks and documents.
3. Publish a worker-facing verification link.
4. Let staff submit identity, documents, biometric confirmation, and liveness evidence from their phone.
5. Run AI-backed verification and risk scoring.
6. Produce a signed VIQ.
7. Hold risky cases for review and release only eligible records.

Lattice also includes a credit wallet. Institutions generate an API key on the Lattice landing page, buy verification credits through Squad checkout, and consume those credits when running verification.

## Technical Highlights

- **Signed VIQ:** every decision is cryptographically signed for auditability.
- **Proof of life:** browser-based MediaPipe face tracking checks alignment, blink, head movement, and stable capture.
- **Deepfake detection:** server-side model-backed frame analysis checks for synthetic or manipulated media.
- **Face matching:** live face captures can be compared against enrolled face templates using embedding similarity.
- **Biometric readiness:** the worker flow includes a biometric requirement step for institutions that already hold biometric records.
- **Document consistency:** uploaded documents are parsed and checked for name, date of birth, staff ID, and service timeline conflicts.
- **Payroll anomaly detection:** Isolation Forest flags suspicious payroll clusters using metadata such as device sharing, GPS proximity, registration bursts, and BVN collisions.
- **Squad integration:** Lattice uses Squad for credit purchase checkout, BVN-oriented identity workflows, OTP/SMS support where enabled, payment/disbursement hooks, and webhook-based confirmation.
- **Python SDK:** existing payroll systems can call Lattice without adopting the demo UI.

## Tech Stack

### Backend

- Python 3.11+
- FastAPI
- SQLAlchemy
- PostgreSQL
- Pydantic Settings
- httpx
- cryptography
- Pillow
- pandas / NumPy / scikit-learn
- pypdf

### AI / ML

- MediaPipe Face Landmarker in the browser via WebAssembly
- Isolation Forest for unsupervised payroll anomaly detection
- Face embedding similarity for biometric-style face matching
- EfficientNet-style deepfake classification through the AI worker path
- Rule-based and extraction-assisted document consistency engine
- Bias audit endpoint for fairness reporting

### Frontend

- Next.js
- React
- TypeScript
- Mantine UI
- Lucide icons
- MediaPipe Tasks Vision

### SDK

- Python package under `sdk/python`
- Installable directly from GitHub or local source

### Infrastructure

- Render for backend/API and AI worker deployment
- Vercel for frontend apps
- Render PostgreSQL for production database
- Docker / Docker Compose for local runtime

## Codebase Architecture

```text
.
├── app/                         # FastAPI backend
│   ├── api/routes/              # REST endpoints
│   ├── ai/                      # AI and data intelligence modules
│   ├── core/                    # config, auth, security, scoring
│   ├── db/                      # database models/session/init
│   ├── schemas/                 # request/response contracts
│   └── services/                # orchestration, Squad, billing, VIQ, jobs
├── apps/
│   ├── frontend/                # Ogun payroll + worker verification UI
│   └── lattice-landing/         # Lattice public landing, docs, API-key/credits
├── sdk/python/                  # Python SDK
├── scripts/                     # demo and smoke scripts
├── tests/                       # backend tests
├── tools/                       # local endpoint/liveness testers
├── docs/                        # runbooks, AI notes, Squad notes, pitch docs
├── Dockerfile                   # main backend Docker image
├── Dockerfile.ai                # AI worker image
└── docker-compose.yml           # local Postgres/API stack
```

## AI and ML Features

### 1. Liveness Detection

The worker phone runs a browser-based face tracker using MediaPipe Face Landmarker. The UI asks the worker to align their face, blink, turn their head, and hold still for capture.

This helps block static photos and basic replay attempts before the backend even receives evidence.

### 2. Deepfake Detection

After liveness, the captured frame can be sent to the AI worker for synthetic-media analysis. The model returns a synthetic probability and marks risky media as `DEEPFAKE_DETECTED`.

This is separate from liveness: liveness proves motion; deepfake detection checks whether the visual evidence itself looks manipulated.

### 3. Face Matching

Lattice supports matching a live capture against an enrolled face template. The backend extracts embeddings and compares similarity using cosine distance. Low similarity raises `FACE_MISMATCH`.

### 4. Payroll Anomaly Detection

The anomaly engine uses Isolation Forest on synthetic payroll metadata. It flags statistical outliers such as shared devices, suspicious GPS clusters, timestamp bursts, and BVN collisions.

Each flagged worker receives plain-English explanations so HR can understand why a case needs review.

### 5. Document Consistency Engine

The document engine extracts and compares important fields across uploaded documents:

- staff ID
- full name
- date of birth
- appointment date
- promotion date
- ministry/department records

It flags conflicts such as mismatched names, impossible timelines, missing records, or inconsistent age evidence.

### 6. Bias and Fairness Reporting

The project includes a fairness/bias-audit endpoint and documentation so thresholds can be evaluated across representative verification cases before real deployment.

## How We Came About It

The product came from direct field insight.

Teslim’s mother, a current Ogun State teacher, explained how verification exercises are physically stressful for honest teachers. A ministry stakeholder explained the HR-side problem: payroll records can keep people who have left, relocated, or died, and inconsistent documents can affect retirement and service duration.

That shaped Lattice into a general institutional verification SDK, with Ogun State education payroll used as the concrete demo case.

## Environment Variables

Create `.env` from `.env.example`:

```powershell
copy .env.example .env
```

Core backend values:

```env
APP_NAME=Lattice TrustAnchor
APP_ENV=local
APP_DEBUG=true
API_V1_PREFIX=/api/v1
CORS_ALLOW_ORIGINS=["*"]

DATABASE_URL=postgresql+psycopg://lattice:lattice@localhost:5432/lattice
INIT_DB_ON_STARTUP=false
LATTICE_API_KEY=

PUBLIC_FRONTEND_URL=https://lattice-be.vercel.app
PUBLIC_BACKEND_URL=https://lattice-be.onrender.com
PUBLIC_LATTICE_URL=https://lattice-peach.vercel.app

SQUAD_BASE_URL=https://sandbox-api-d.squadco.com
SQUAD_SECRET_KEY=
SQUAD_PUBLIC_KEY=
SQUAD_WEBHOOK_SECRET=
SQUAD_MERCHANT_ID=
SQUAD_SMS_ENDPOINT=/sms/send/instant
SQUAD_SMS_SENDER_ID=Lattice

CREDIT_PRICE_NAIRA=150
DEFAULT_ACCOUNT_INITIAL_CREDITS=0
BILLING_ENFORCE_CREDITS=true

VIQ_SIGNING_SECRET=change-this-before-demo
OTP_TTL_SECONDS=90

AI_WORKER_URL=
AI_WORKER_API_KEY=
DEEPFAKE_MODEL_PATH=
DEEPFAKE_MODEL_URL=
DEEPFAKE_THRESHOLD=0.85
FACE_MATCH_THRESHOLD=0.92
```

Frontend values:

```env
NEXT_PUBLIC_API_URL=https://lattice-be.onrender.com/api/v1
NEXT_PUBLIC_PUBLIC_APP_URL=https://lattice-be.vercel.app
NEXT_PUBLIC_LATTICE_API_KEY=your-demo-api-key

NEXT_PUBLIC_LATTICE_API_URL=https://lattice-be.onrender.com/api/v1
NEXT_PUBLIC_OGUN_DEMO_URL=https://lattice-be.vercel.app/admin/ogun-education
NEXT_PUBLIC_WORKER_DEMO_URL=https://lattice-be.vercel.app/verify/demo
NEXT_PUBLIC_API_DOCS_URL=https://lattice-be.onrender.com/docs
NEXT_PUBLIC_GITHUB_URL=https://github.com/Sadiq-Teslim/lattice-be
```

## Quick Start

### Backend

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
python -m app.db.init_db
uvicorn app.main:app --reload --port 8010
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/api/v1/health
```

### Backend with Docker

```powershell
docker compose up --build
```

### Ogun Payroll Frontend

```powershell
cd apps/frontend
npm install
npm run dev -- --port 3011
```

Open:

```text
http://127.0.0.1:3011/admin/ogun-education
```

### Lattice Landing Page

```powershell
cd apps/lattice-landing
npm install
npm run dev -- --port 3010
```

Open:

```text
http://127.0.0.1:3010
```

## Python SDK

Install from GitHub:

```powershell
python -m pip install git+https://github.com/Sadiq-Teslim/lattice-be.git#subdirectory=sdk/python
```

Example:

```python
from lattice_sdk import LatticeClient

client = LatticeClient(
    base_url="https://lattice-be.onrender.com/api/v1",
    api_key="YOUR_LATTICE_API_KEY",
)

print(client.health())
```

Run the SDK demo:

```powershell
python scripts\demo_sdk.py --base-url https://lattice-be.onrender.com/api/v1 --api-key YOUR_LATTICE_API_KEY
```

## Demo Flow

Recommended 90-second demo:

1. **Open Lattice landing page**
   - Show Lattice as a general verification SDK for institutions.
   - Generate an API key.
   - Buy verification credits with Squad checkout.

2. **Open Ogun payroll dashboard**
   - Show staff records, salaries, documents, disbursement status, and verification status.
   - Explain that the HR system already exists; Lattice plugs into it.

3. **Run staff verification**
   - Use the Teslim seeded record as the passing case.
   - Show the VIQ result, trust score, and release eligibility.
   - Show a failing worker record for contrast.

4. **Create a verification exercise**
   - HR chooses required documents and verification checks.
   - Lattice generates a public worker link.

5. **Open worker verification link**
   - Worker enters identity details.
   - Uploads required documents.
   - Completes biometric confirmation and proof-of-life liveness check.
   - Submits verification.

6. **Return to HR submissions**
   - Show the submitted record and decision evidence.
   - Explain that genuine workers avoid stressful physical queues while HR still gets stronger verification.

## Important Links

- Lattice landing page: https://lattice-peach.vercel.app
- Lattice Get Started / API keys / credits: https://lattice-peach.vercel.app/get-started
- API reference: https://lattice-peach.vercel.app/api-reference
- Ogun payroll demo: https://lattice-be.vercel.app/admin/ogun-education
- Backend API docs: https://lattice-be.onrender.com/docs
- Backend health: https://lattice-be.onrender.com/api/v1/health
- AI worker: https://lattice-ai.onrender.com
- GitHub: https://github.com/Sadiq-Teslim/lattice-be

## Key Docs

- `docs/demo-runbook.md`
- `docs/squad-integration.md`
- `docs/ai-and-fairness.md`
- `docs/identity-bvn.md`
- `docs/document-consistency.md`
- `docs/ai-worker-deployment.md`
- `docs/lattice_pm_pitch_script.md`

## Team

**Team Lattice**

- **Teslim Sadiq** — Backend, AI, SDK, integrations
- **Lydia Solomon** — Product, research, verification UX

Built for Squad Hackathon 3.0.
