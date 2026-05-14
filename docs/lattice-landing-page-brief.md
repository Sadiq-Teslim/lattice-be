# Lattice Landing Page Brief

This file is a handoff brief for building the public Lattice landing page in another Codex chat. It is not the Ogun payroll product UI. The payroll/admin product should use Ogun green and a government operations look. The public Lattice site should use Squad red as the brand accent and should explain Lattice as a deployable SDK/API for proof-of-life, staff verification, payroll gating, and auditable disbursement workflows.

## Goal

Build a polished, modern landing page for Lattice that explains:

- what Lattice is
- why institutions use it
- how the SDK/API works
- how to integrate it into an existing payroll or HR system
- the AI checks it performs
- the VIQ output it produces
- the Squad partnership/payment bridge
- API/SDK documentation
- research/source credibility

The page should make Lattice feel like a serious infrastructure product, not a hackathon toy.

## Brand Position

Lattice is a verification SDK for institutions that must confirm a real person is eligible before money, access, or benefits are released.

Core one-liner:

> Lattice is a proof-of-life and document-verification SDK that plugs into payroll systems to verify staff, flag risk, and release only eligible payments.

Short positioning:

> Built for governments, schools, agencies, and payroll platforms that need to reduce ghost workers, automate staff verification, and create an auditable link between identity verification and payment release.

Squad positioning:

> Lattice uses Squad as a payment and identity infrastructure partner for BVN resolution, virtual accounts, transfers, SMS OTP, and webhook-based payment confirmation.

Use "Powered by Lattice" for embedded verification flows. Use "Payment infrastructure partner: Squad" or "Built with Squad APIs" for Squad references. Do not imply Squad officially endorses the product unless we have explicit approval.

## Visual Direction

Use the attached reference image as inspiration for layout quality:

- large rounded application shell
- soft off-white page background
- clean left sidebar/navigation
- spacious cards
- high contrast headings
- refined modern SaaS spacing
- subtle shadows only
- no clutter
- no dark intimidating interface

For the Lattice public landing page:

- Background: `#F7F7F7`
- Surface: `#FFFFFF`
- Primary text: `#0D0D0D`
- Secondary text: `#6B7280`
- Accent / brand: `#E8001C` (Squad red)
- Accent dark: `#B80016`
- Success: `#16A34A`
- Warning: `#D97706`
- Danger: `#DC2626`
- Borders: `#E5E7EB`

Typography:

- Font: Inter
- Hero headline: 56-72px desktop, 36-44px mobile
- Section headline: 36-48px desktop
- Body: 16-18px
- Caption: 14px
- Do not use text smaller than 14px.

Tone:

- confident
- institutional
- practical
- technical enough for developers
- not too playful
- not crypto/fintech hype

## Suggested Page Structure

### 1. Hero

Purpose: explain Lattice in one screen.

Content:

- Top nav: Lattice logo, Product, SDK, API Docs, Use Cases, Sources, GitHub, "View Demo"
- H1: "Verify staff before payroll moves."
- Subcopy: "Lattice is a proof-of-life and document-verification SDK for institutions. Plug it into payroll, verify workers with AI and identity checks, generate a signed VIQ, and release only eligible salaries."
- Primary CTA: "View SDK Docs"
- Secondary CTA: "Open Ogun Payroll Demo"
- Small partner line: "Built with Squad APIs for BVN, OTP, virtual accounts, transfers, and payment webhooks."

Hero visual:

Show a product mockup, not an abstract illustration. Suggested mockup:

- left side: payroll batch card
- center: Lattice verification gate
- right side: PASS/REVIEW/FAIL decisions
- include a signed VIQ snippet

Avoid generic gradients or decorative blobs.

### 2. Problem

Purpose: explain why this matters.

Headline:

> Payroll fraud persists because verification and disbursement are disconnected.

Points:

- Staff verification is often manual and periodic.
- Payroll systems can hold stale, duplicate, or inconsistent staff records.
- Ghost workers can remain on salary batches if proof-of-life is not checked at payment time.
- Document inconsistencies can be missed when HR reviews files manually.

Include source-backed stat cards:

- Kaduna removed 23,846 ghost workers and reportedly recovered NGN 36.5B annually.
- Lagos audit exposed 5,070 ghost workers.
- Ogun has used BVN/personnel verification as ghost-worker controls.

Label as "publicly reported examples" unless directly quoting.

### 3. What Lattice Does

Headline:

> One verification layer before salary release.

Cards:

1. Proof of life
   - liveness challenge
   - face/identity signals
   - deepfake/media-risk classification

2. Document consistency
   - DOB comparison
   - appointment date vs first salary date
   - missing document detection
   - promotion/posting record checks

3. Payroll anomaly detection
   - duplicate BVN
   - shared device
   - GPS/IP clusters
   - registration bursts

4. Payment gate
   - Trust Score
   - PASS/REVIEW/FAIL
   - signed VIQ
   - Squad transfer/webhook audit trail

### 4. How It Works

Use a horizontal workflow or vertical timeline:

1. Payroll system creates a pay cycle
2. Lattice creates worker verification sessions
3. Worker completes OTP, liveness, and document submission
4. Lattice evaluates identity, documents, and anomaly risk
5. Lattice returns a signed VIQ
6. Payroll releases only PASS workers
7. Squad webhook closes the payment audit trail

Copy:

> Lattice does not replace payroll. It adds a verification checkpoint before payroll disbursement.

### 5. SDK Integration

Show this as developer-friendly.

Install:

```bash
python -m pip install git+https://github.com/Sadiq-Teslim/lattice-be.git#subdirectory=sdk/python
```

Python example:

```python
from lattice_sdk import LatticeClient

client = LatticeClient(
    base_url="https://lattice-be.onrender.com/api/v1",
    api_key="YOUR_LATTICE_API_KEY",
)

result = client.verify_and_disburse(
    worker_id="worker-id",
    pay_cycle_id="pay-cycle-id",
    evidence={
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
    },
    initiate_transfer=False,
)

print(result["viq"]["verdict"], result["viq"]["trust_score"])
```

CLI demo:

```bash
python scripts/demo_sdk.py \
  --base-url https://lattice-be.onrender.com/api/v1 \
  --api-key YOUR_LATTICE_API_KEY
```

### 6. API Docs

Point users to:

- Render OpenAPI docs: `https://lattice-be.onrender.com/docs`
- API base: `https://lattice-be.onrender.com/api/v1`
- GitHub repo: `https://github.com/Sadiq-Teslim/lattice-be`

Important API groups to show:

#### Health

`GET /api/v1/health`

Checks service status.

#### Demo payroll

`POST /api/v1/demo/seed`

Creates synthetic ministry payroll data for demos.

`GET /api/v1/demo/anomalies?pay_cycle_id=...`

Runs anomaly detection across a pay cycle.

#### Workers and pay cycles

`GET /api/v1/workers`

Lists worker records.

`GET /api/v1/pay-cycles`

Lists pay cycles.

#### Verification sessions

`POST /api/v1/verification/sessions`

Creates a worker verification session.

`POST /api/v1/verification/sessions/{session_id}/evidence`

Submits liveness, face, BVN, deepfake, and document evidence.

`POST /api/v1/verification/sessions/{session_id}/finalize`

Generates a VIQ.

#### One-call SDK endpoint

`POST /api/v1/sdk/verify-and-disburse`

Runs the verification/disbursement orchestration in one call.

Requires:

`X-Lattice-API-Key`

#### AI endpoints

`POST /api/v1/ai/liveness/evaluate`

Evaluates liveness challenge results.

`POST /api/v1/ai/document-consistency/evaluate`

Checks staff document consistency.

`POST /api/v1/ai/bias-audit/liveness/demo`

Returns demo fairness metrics.

#### Squad endpoints

`GET /api/v1/squad/bvn/{bvn}` or project-specific Squad BVN wrapper if available.

`POST /api/v1/squad/accounts/lookup`

Looks up bank account identity.

`POST /api/v1/squad/transfers/viq`

Initiates VIQ-linked transfer where merchant eligibility is available.

`POST /api/v1/webhooks/squad`

Receives Squad webhook events.

Confirm exact route names from `app/api/routes` before final implementation because backend route names may evolve.

### 7. VIQ Section

Explain the core output.

Headline:

> Every verification produces a signed Verifiable Institutional Quote.

Example:

```json
{
  "worker_id": "EDU-OG-00095",
  "trust_score": 94,
  "verdict": "PASS",
  "flags": [],
  "liveness": "PASSED",
  "documents": "DOCUMENTS_CLEAN",
  "bvn_match": true,
  "payment_status": "READY",
  "timestamp": "2026-05-14T10:00:00Z"
}
```

Explain:

- `PASS`: eligible for payment
- `REVIEW`: salary held for HR review
- `FAIL`: salary blocked

### 8. Use Cases

Cards:

1. Government payroll
   - prevent salary release without proof-of-life
   - reduce ghost-worker exposure

2. Annual staff verification
   - replace manual file checks
   - collect documents through a generated verification link

3. Schools and tertiary institutions
   - verify teachers/staff across LGAs
   - flag no-shows and inconsistent records

4. Payroll platforms
   - integrate Lattice as a trust layer before disbursement

### 9. Demo Links

Use current frontend routes:

- Ogun payroll demo: `/admin/ogun-education`
- Worker verification demo: `/verify/demo`
- Backend docs: `https://lattice-be.onrender.com/docs`
- GitHub: `https://github.com/Sadiq-Teslim/lattice-be`

When deployed to Vercel, replace relative demo paths with production URLs.

### 10. Sources / Evidence

Include a "Research-backed problem" section with source cards.

Recommended sources:

1. OAGF IPPIS overview
   - Shows IPPIS goals: centralized personnel database, salary monitoring, payment controls, deduction/remittance handling.
   - URL: `https://oagf.gov.ng/initiative/ippis/`

2. Office of the Head of Civil Service IPPIS department
   - Shows biometric enrollment, personnel audit, recurrent re-verification, nominal roll, and key fields like DOB and first appointment.
   - URL: `https://clients.rvomedia.com/ohcsf1/department/ippis/`

3. Ogun Staff Biometrics Registration and Verification Portal
   - Confirms Ogun has a public staff biometrics verification portal.
   - URL: `https://verifystaff.ogunstate.gov.ng/`

4. Daily Trust: Ogun BVN salary control
   - Public report on Ogun requiring BVN before salary payment.
   - URL: `https://dailytrust.com/no-bvn-no-salary-ogun-govt-tells-workers/`

5. Daily Trust: Ogun personnel verification
   - Public report on Ogun verification for workers in tertiary institutions.
   - URL: `https://dailytrust.com/ogun-begins-verification-of-workers-in-tertiary-institutions/`

6. Squad API docs
   - Payment, BVN, virtual account, SMS, and webhook references.
   - URL: `https://docs.squadco.com/`

Use these as source cards, not long paragraphs. The landing page should be clean and credible.

## Landing Page Copy Draft

Hero H1:

> Verify staff before payroll moves.

Hero subcopy:

> Lattice is a proof-of-life and document-verification SDK for institutions. It plugs into payroll systems, verifies staff with AI and identity checks, generates a signed VIQ, and releases only eligible salaries through payment infrastructure like Squad.

CTA:

- View API Docs
- Open Demo

Problem headline:

> Payroll fraud is not only a payment problem. It is a verification problem.

SDK headline:

> Add Lattice to payroll in one verification call.

Squad partner copy:

> Lattice integrates with Squad APIs for BVN resolution, OTP delivery, virtual accounts, transfers, and webhook confirmation, creating a traceable path from verification to payment.

Sources headline:

> Built around real public-sector verification workflows.

Footer:

> Lattice is a hackathon prototype for Squad Hackathon 3.0. Built by Teslim Sadiq. Payment infrastructure partner: Squad.

## Pages / Routes To Build

Option A: single page:

- `/`

Option B: landing plus docs:

- `/`
- `/docs`
- `/sdk`
- `/sources`

Recommended for speed:

- Build one rich landing page at `/`
- Use anchor links for Product, SDK, API Docs, Sources, Demo

## Implementation Notes

Current project:

- Next.js app lives in `apps/frontend`
- Existing design tokens are in `apps/frontend/src/shared/ui/tokens.css`
- Current app routes:
  - `/admin/ogun-education`
  - `/verify/demo`

The landing page can be added to:

- `apps/frontend/src/app/page.tsx`

But if the current `/` redirects or renders the admin dashboard, update it so:

- `/` = Lattice landing page
- `/admin/ogun-education` = Ogun payroll/admin product
- `/verify/demo` = worker verification flow

Do not make the landing page look like the Ogun payroll app. Landing uses Squad red. Ogun payroll uses Ogun green.

## Must Avoid

- Do not call it "trained by us" for deepfake unless there is proof. Say "model-backed inference."
- Do not imply Squad officially endorses Lattice. Say "built with Squad APIs" or "payment infrastructure partner."
- Do not expose real secrets in copy. Use `YOUR_LATTICE_API_KEY`.
- Do not make it a generic SaaS page with vague claims.
- Do not make it dark.
- Do not use fake source claims without links.

## Definition Of Done

The landing page is done when it:

- explains Lattice in 10 seconds
- shows how payroll systems integrate it
- shows SDK/API usage
- links to backend API docs and GitHub
- includes Squad as partner/infrastructure
- includes public research/source cards
- links to Ogun payroll demo and worker verification demo
- visually feels premium and credible


