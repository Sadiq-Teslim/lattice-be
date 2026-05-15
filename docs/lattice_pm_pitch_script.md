# Lattice PM Pitch Script

## Product Positioning

**Lattice is an AI-powered verification SDK for institutions that need proof before granting access, approval, benefits, salary, pension, scholarship, or any other institutional decision.**

It plugs into existing systems and adds a trust layer that answers one question:

> Is this person real, alive, present, and consistent with the institution's records?

For this hackathon, we are demonstrating Lattice through a government payroll and staff verification use case for Ogun State Ministry of Education.

## The Core Story

We started from a real problem.

Teslim spoke with his mother, a serving teacher under Ogun State Ministry of Education, and with Mrs. Idowu Saka, Zonal Secretary of Odeda Local Government under Ogun State Ministry of Education.

From the teacher's side, verification exercises are stressful. Thousands of teachers across local governments are asked to appear physically, often within a narrow window, carrying documents they have submitted many times before.

From the ministry's side, verification is necessary because payroll records are not always clean. Some people leave the country, resign, or die, but their names can remain on payroll. Some staff also have inconsistent dates across documents, especially age-related records, which can affect retirement and years of service.

So the tension is clear:

- Government needs verification.
- Honest workers want it to be simple.
- Manual verification is slow, stressful, and still imperfect.

Lattice solves this by making verification digital, automated, and reusable across institutions.

## 90-Second Pitch Script

**0-10 seconds: General framing**

Many institutions need to verify people before granting something important: salary, pension, access, scholarship, benefits, or approval. But most verification processes are still manual, stressful, and easy to bypass.

**10-25 seconds: Product introduction**

Lattice is an AI-powered verification SDK that institutions can plug into their existing systems. It verifies identity, documents, biometrics, proof of life, and risk signals, then returns a signed verification result called a VIQ, or Verifiable Institutional Quote.

**25-45 seconds: Real use case**

We focused on government payroll because of a real story. We spoke with a serving Ogun State teacher and a ministry official. Teachers told us annual verification is stressful because thousands of staff may be asked to appear physically in one day. The ministry also confirmed that payroll verification is difficult because departed, emigrated, and deceased staff can remain on salary records, while inconsistent age and document records are hard to catch manually.

**45-65 seconds: What Lattice does**

With Lattice, HR creates a verification exercise, selects what to verify, and publishes a link. The worker opens the link, confirms their staff record, uploads required documents, performs biometric matching, completes a live face check, and submits. Lattice checks everything automatically and updates HR with a decision: pass, review, or fail.

**65-80 seconds: Squad integration**

Squad powers the commercial and payment layer. Institutions buy Lattice verification credits through Squad payment channels, and every verification consumes credits through the API key attached to that institution. This makes Lattice monetizable as an SDK while keeping the integration simple.

**80-90 seconds: Close**

The result is a reusable verification infrastructure for institutions: less stress for genuine workers, stronger fraud detection for government, and a scalable SDK that can serve payroll, pensions, scholarships, onboarding, and access control.

## Demo Flow

### 1. Start On The Lattice Landing Page

Message to say:

> Lattice is built as an SDK, not just a single payroll app. Any institution can integrate it through our API, buy credits, create verification workflows, and receive signed verification results.

Show:

- SDK positioning.
- API documentation.
- Verification providers.
- Squad as payment partner for credits.

### 2. Open The Ogun Payroll System

Message to say:

> To make the SDK tangible, we built a payroll desk for Ogun State Ministry of Education. This represents how an existing HR or payroll system would use Lattice in the background.

Show:

- Staff records.
- Salary details.
- Documents.
- Verification status.
- Payroll decision states.

Avoid saying:

- "This is Lattice everywhere."
- "Run Lattice gate."

Use:

- "Run Verification."
- "Verify staff."
- "Release eligible."

### 3. Verify A Staff Record

Use Teslim's seeded staff record as the successful case.

Message to say:

> Here, HR can verify one staff member directly from the payroll table. Lattice checks identity, document consistency, biometric readiness, proof of life, and payroll risk before deciding whether salary can move.

Expected result:

- Teslim passes.
- Trust score should be high.
- Salary becomes eligible for release.
- Drawer closes after payment or release action.

### 4. Show The Failing Record

Use `OG00002`.

Message to say:

> This record fails because its evidence does not correlate cleanly. In a real ministry workflow, this would stay held for HR review instead of being released automatically.

Expected result:

- Document or identity issue.
- Review/fail status.
- Salary held.

### 5. Create A Verification Exercise

Message to say:

> Payroll verification is only one mode. HR can also create annual staff verification exercises. They choose what to collect and what Lattice should check.

Show:

- New exercise modal.
- Exercise name, for example: `June 2026 Verification Exercise`.
- Documents to collect.
- Rules: identity, biometric match, proof of life, document consistency, payroll anomaly.
- Publish link.

### 6. Open The Worker Verification Link

Message to say:

> This is the worker side. The teacher does not need to travel to a central office. They complete the verification from their phone.

Show:

- Identity form.
- Document upload fields.
- Biometric capture.
- Proof of life.
- Final submission.

### 7. Return To HR Submissions

Message to say:

> Once submitted, HR sees the result inside the payroll system. Lattice turns a manual verification exercise into a digital evidence trail.

Show:

- Submission appears.
- Decision.
- Documents.
- Liveness and biometric status.
- Review/pass outcome.

## What We Built

### 1. Lattice SDK Backend

The backend exposes APIs for:

- Staff verification.
- Payroll verification.
- Verification exercises.
- Public worker verification links.
- Document upload and consistency checks.
- Liveness evaluation.
- Biometric matching.
- Face/deepfake inference routing.
- Payroll anomaly scoring.
- VIQ generation.
- Billing credits.
- Squad payment integration for credit purchase.

### 2. Ogun Payroll Demo System

The payroll UI simulates how a ministry HR/payroll platform would use Lattice:

- Staff records.
- Salary data.
- Bank/disbursement data.
- Documents.
- Verification decisions.
- Staff actions.
- Verification exercises.
- Worker submissions.
- Disbursement readiness.

### 3. Worker Verification UI

The worker flow includes:

- Staff identity confirmation.
- Required document upload.
- Biometric matching against enrolled record.
- Browser-based proof of life.
- Final submission to HR.

### 4. SDK/Developer Experience

Lattice is positioned as a plug-and-play SDK:

- API key per institution.
- Credits per verification.
- Public API documentation.
- Signed VIQ output.
- Embeddable verification links.
- Backend integration endpoints.

## AI Components

### Liveness Detection

Runs in the browser using MediaPipe Face Landmarker through WebAssembly. It tracks facial landmarks, checks face alignment, head movement, blink/eye state, and stable presence.

For the pitch demo, the flow is intentionally less strict so lighting or camera quality does not block the presentation.

### Biometric Matching

Each worker can have an enrolled biometric template in the institution's system. During verification, the worker provides a fresh biometric sample. Lattice converts that sample into a vector and compares it with the enrolled template using cosine similarity.

Supported biometric modes:

- Face.
- Fingerprint.
- Iris.
- Voice.

### Document Consistency Engine

Lattice checks submitted documents against staff records. It looks for:

- Name mismatches.
- Date of birth conflicts.
- Appointment date issues.
- Promotion timeline issues.
- Retirement or service-year inconsistencies.
- Missing required documents.

This is important for age falsification and conflicting civil-service records.

### Payroll Anomaly Detection

Lattice uses payroll metadata to detect suspicious patterns:

- Shared device IDs.
- BVN collisions.
- Registration bursts.
- GPS clustering.
- IP or network overlaps.

This helps identify ghost-worker clusters even when there is no labelled fraud dataset.

### Deepfake / Media Authenticity

After proof of life, captured media can be checked by a model-backed inference service to detect synthetic or manipulated face evidence.

This protects against video injection and AI-generated impersonation.

## Squad Integration

The clearest Squad use case is Lattice credit purchase.

Institutions need credits to run verifications. Each institution has:

- Billing account.
- API key.
- Credit balance.
- Credit ledger.

They can purchase credits through Squad payment channels, including:

- Card.
- Transfer.
- USSD, where available.

Once payment succeeds, Squad webhook confirmation updates the credit purchase and credits the institution's Lattice account.

This turns Lattice from a demo into a monetizable SDK business.

## The VIQ

VIQ means **Verifiable Institutional Quote**.

It is the signed result produced by Lattice after verification.

It contains:

- Worker ID.
- Trust score.
- Verdict.
- Risk flags.
- Evidence summary.
- Timestamp.
- Signature.
- Payment or release reference where applicable.

The simple rule:

> No valid VIQ, no automatic approval.

## Important Demo Records

### Passing Record

Use:

- Staff ID: `OG00001`
- Name: `Teslim Adetola Sadiq`

This is the clean record designed to pass verification.

### Failing Record

Use:

- Staff ID: `OG00002`
- Name: `Adebayo Ogunleye`

This record is designed to show a failed or review case.

## Best Closing Line

Lattice is not just solving one payroll demo. It is building verification infrastructure for institutions. Any organisation that needs to know whether a person is real, eligible, consistent, and present can plug in Lattice before granting access, approval, salary, pension, or benefits.

## Likely Judge Questions And Answers

### Is Lattice only for payroll?

No. Payroll is the use case we chose because the problem is urgent and easy to understand. The SDK can also support pensions, scholarships, contractor onboarding, exams, grants, and institutional access.

### What makes it AI-powered?

Lattice combines multiple AI and ML checks: browser liveness, biometric similarity matching, document consistency analysis, deepfake/media authenticity inference, and payroll anomaly detection.

### Why not just use biometrics?

Biometrics alone only says a person resembles a stored template. Lattice combines biometric evidence with document consistency, proof of life, payroll anomaly signals, and institutional records.

### Why does HR still need review?

Some cases should not be automatically rejected. A mismatch may be caused by an old record, name spelling difference, or document update. Lattice separates clean passes, hard fails, and review cases.

### How does Squad fit?

Squad powers payment for Lattice credits. Institutions buy verification credits, those credits are tied to their API key, and Lattice deducts credits when verification APIs are used.

### What is the business model?

Lattice charges institutions per verification credit. This makes it simple for government agencies, schools, pension boards, and other institutions to pay based on usage.

### What is the impact?

For government, Lattice reduces payroll leakage and improves auditability. For workers, it removes stressful physical verification. For institutions, it creates a reusable trust layer.

