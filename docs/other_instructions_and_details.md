What you're building:

Lattice. An AI-powered verification system that confirms government employees are real before their salary is released through Squad.

---

The flow:

Notify — Pay cycle starts. Squad SMS goes to every worker. Verify yourself or your salary doesn't move.

Prove you're alive — Worker opens app. Blinks twice, turns head. MediaPipe confirms a real human is present.

Prove you're not fake — Captured frame goes to backend. EfficientNet checks if the face is AI-generated. Deepfake detected — blocked.

Prove you're not a pattern — Isolation Forest scans the whole payroll. Same device shared across ten workers? Same GPS location for fifty people? Ghost cluster — flagged.

Prove your identity — Squad BVN verification fires. Legal name cross-checked against payroll record. Mismatch — flagged.

Get a verdict — Everything combined into one Trust Score. Pass, Review, or Fail. Signed and logged permanently as a Verifiable Institutional Quote.

Get paid or get blocked — Score 80+: Squad transfers salary automatically. Score 50-79: human review. Below 50: blocked, admin alerted.

Audit closed — Squad webhook confirms payment. Record locked.

---

That's Lattice. Eight steps. One clear output. No ghost worker gets paid.


Based on everything — the PRD, the research, the interviews, the challenge brief — here's the clean version:

---

What you're building:

Lattice. An AI-powered ghost worker detection system that verifies government employees are real before their salary is paid — using biometrics, document intelligence, and Squad's payment infrastructure.

---

The flow in plain language:

Step 1 — Worker gets notified
A new pay cycle starts. Every enrolled government worker gets an SMS via Squad telling them to verify themselves before their salary releases.

Step 2 — Liveness check
Worker opens the app. Camera activates. System asks them to blink twice and turn their head. MediaPipe reads their face in real time. This confirms a live human is present — not a photo, not a video, not a ghost.

Step 3 — Deepfake check
The captured frame goes to the backend. EfficientNet-B0 checks whether the face is AI-generated or manipulated. If it detects synthetic media — payment blocked immediately.

Step 4 — Anomaly scan
Isolation Forest checks the worker's payroll record against the entire workforce. Is their device shared with five other workers? Are their GPS coordinates identical to ten other people? Did fifty people register at the exact same timestamp? Any of these patterns flags a ghost worker cluster.

Step 5 — Identity resolution via Squad
System calls Squad's BVN verification endpoint. Returns the worker's legal name and date of birth. Cross-checks it against payroll records. Mismatch — flagged.

Step 6 — Trust Score generated
All signals combined into one number between 0 and 100. Plus a clear verdict: Pass, Review, or Fail. This is the Verifiable Institutional Quote — a signed JSON object that becomes the permanent audit record.

Step 7 — Conditional payment
Score 80 and above: Squad fires the salary transfer automatically to the worker's reserved virtual account. Score 50 to 79: held for human review. Below 50 or any hard flag: blocked, admin alerted, incident logged.

Step 8 — Audit closed
Squad's webhook confirms payment. VIQ updates to PAID AND VERIFIED. Full audit trail locked permanently per worker per pay cycle.

---

The Squad APIs doing real work:
- SMS — notify workers to verify
- BVN verification — confirm identity
- Virtual accounts — one per worker, all payments route through it
- Transfers — conditional on trust score
- Webhooks — close the audit loop

---

The demo moment:

Live liveness scan passes. Then you inject a deepfake video — DEEPFAKE DETECTED fires, payment blocked. Then you run the anomaly detection on a synthetic 1,000-person payroll dataset, fifty ghost clusters light up. Then full happy path — BVN resolves, trust score 94, Squad transfer fires, webhook confirms PAID AND VERIFIED. All in under five minutes.


PS: adjust stacks to your preferred stack

BACKEND
Stack: Node.js with TypeScript. Express for the REST API. BullMQ for job queuing. PostgreSQL for permanent storage. Redis for sessions, OTP TTL, and feature caching.
Core Services:
Auth Service Generates unique session tokens per worker per pay cycle. Manages OTP lifecycle via Redis with 90 second TTL. Handles device attestation signatures for offline sync.
Verification Orchestrator The brain of the backend. Receives liveness results, fires deepfake inference, triggers anomaly scan, calls Squad BVN endpoint, aggregates all signals, generates the VIQ, and makes the conditional payment decision. Everything flows through here in sequence.
Squad Integration Service Wraps all five Squad API calls cleanly — SMS, BVN verification, virtual account creation, transfer initiation, webhook listener. Every Squad call is logged with request and response for the GitHub docs.
VIQ Service Builds and signs the Verifiable Institutional Quote JSON object. Stores one record per worker per pay cycle in PostgreSQL. Updates status to PAID AND VERIFIED on webhook confirmation.
Webhook Handler Listens for Squad payment.success events. Updates VIQ status. Triggers admin dashboard refresh. Failed webhooks retry three times with exponential backoff.
Audit Logger Immutably logs every event — liveness result, deepfake score, anomaly score, BVN match, trust score, payment status — per worker per cycle. This is what makes the system defensible to a real government auditor.
Database Schema — simplified:
Workers table — worker ID, name, BVN, virtual account number, enrolled device ID, GPS baseline, enrolled biometric template hash.
PayCycles table — cycle ID, ministry ID, initiated timestamp, status.
VIQ table — VIQ ID, worker ID, cycle ID, trust score, verdict, all flags, Squad transaction reference, timestamp, final status.
AuditLog table — event type, worker ID, cycle ID, payload, timestamp.

AI LAYER
Component 1 — Liveness Detection
Library: MediaPipe Face Mesh via WebAssembly. Runs entirely client-side. No server round trip. Works on 2G.
How it works: loads 478 facial landmark points on the worker's face. Issues a randomised challenge — blink twice, turn head 15 degrees left. Blink detected via Eye Aspect Ratio threshold. Head turn detected via PnP solver estimating head pose from landmarks.
Three failed attempts: session flagged LIVENESS_FAIL. Result signed locally with device attestation and timestamp. If offline, cached in device secure storage and synced on reconnect.
Output: LIVENESS_PASS or LIVENESS_FAIL plus confidence score, sent to backend.
Component 2 — Deepfake Classification
Model: EfficientNet-B0 binary classifier. Pre-trained on ImageNet, fine-tuned on FaceForensics++ dataset covering DeepFakes, Face2Face, and NeuralTextures classes.
How it works: receives the captured liveness frame from the client — 224x224 crop, normalised. Runs inference server-side. Returns P(synthetic) as a float. Threshold set at 0.85. Simultaneously runs cosine similarity check against the worker's enrolled biometric template. Below 0.92 similarity raises FACE_MISMATCH flag.
Output: DEEPFAKE_DETECTED or CLEAN plus confidence score.
Component 3 — Payroll Anomaly Detection
Algorithm: Isolation Forest via scikit-learn. Unsupervised — no labelled fraud data needed.
Feature matrix per worker: device ID frequency across payroll, GPS cluster density, registration timestamp delta from cohort, BVN collision count, IP subnet overlap.
Contamination threshold: 5%. SHAP values computed per flagged worker to explain which features drove the anomaly score in plain language for the admin dashboard.
Demo validation: synthetic dataset of 1,000 workers with 50 injected ghost clusters. Target is 100% cluster detection.
Output: anomaly score, ANOMALY_FLAGGED or CLEAN, SHAP explanation per flag.
Trust Score Formula:
Starts at 100. Deductions: LIVENESS_FAIL minus 40. DEEPFAKE_DETECTED minus 50, immediate hard block. FACE_MISMATCH minus 30. ANOMALY_FLAGGED minus 20. BVN_MISMATCH minus 25.
Hard flags — DEEPFAKE_DETECTED and LIVENESS_FAIL after three attempts — block payment regardless of total score.

BUILD ORDER FOR TESLIM
Day 1 — today: Squad API integration service first. Get BVN verification, virtual account creation, SMS, and transfers working against Squad sandbox. Get webhooks receiving. This is the non-negotiable foundation.
Day 2 — tomorrow: Isolation Forest anomaly detection with synthetic dataset. Liveness detection client-side with MediaPipe. Both of these are the most demo-visible AI components.
Day 3 — Thursday: Deepfake classifier inference endpoint. VIQ generation and signing. Full end-to-end flow connected. Admin dashboard receiving results.
Day 4 — Friday morning: Demo rehearsal. Fix what breaks. Nothing new gets added.



PS: I'm using Fastapi not Node tho. 