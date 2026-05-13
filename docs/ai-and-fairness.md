# AI And Fairness Notes

Lattice uses AI where it materially improves verification. It should not be pitched as a black-box firing system. It is a payment-release control with audit and human review.

## AI Components

### Payroll Anomaly Detection

Status: implemented.

Model:

- Isolation Forest
- Unsupervised
- Fits the current payroll cohort

Signals:

- device ID frequency
- GPS cluster density
- BVN collision count
- IP subnet overlap
- registration timestamp bursts

Why this is smart:

It does not need labeled ghost-worker data. It detects suspicious payroll structure and explains why a worker was flagged.

Explainability:

- plain-language anomaly reasons
- numeric top feature contribution payloads
- method label: `robust_zscore_contribution`

This is intentionally described as contribution explainability, not a claim that the current Python
3.14 environment is running the external SHAP package.

### Deepfake Detection

Status: implemented as model-backed inference.

Model:

- EfficientNet-B0
- Fine-tuned on FaceForensics++ C23
- Source: `Xicor9/efficientnet-b0-ffpp-c23`

Output:

- `CLEAN`
- `DEEPFAKE_DETECTED`
- `synthetic_probability`
- preprocessing metadata
- multi-frame aggregate probability

Important limitation:

The model card positions the detector for academic/research use. In the demo, present it as a fraud-risk signal, not as courtroom-grade forensic truth.

Inference improvements:

- largest-face crop when OpenCV detects a face
- full-frame fallback when no face is detected
- horizontal-flip test-time augmentation
- multi-frame aggregation endpoint for liveness video snippets

### Liveness Detection

Status: browser client and backend contract implemented.

Expected client:

- MediaPipe Face Mesh
- blink count
- head-turn angle
- confidence
- attempts

Backend:

- evaluates whether the MediaPipe challenge result meets the threshold
- stores the evidence
- feeds the result into VIQ scoring

Implemented client:

- `tools/liveness-client/index.html`
- uses MediaPipe Face Landmarker for web
- computes Eye Aspect Ratio from facial landmarks
- estimates head turn from nose/cheek landmark geometry
- signs offline liveness payloads with browser-generated ECDSA P-256 keys
- stores offline payloads in IndexedDB and syncs them later

### Face Match

Status: implemented.

Model:

- MobileNetV3-Small visual embedding model
- cosine similarity
- threshold: 0.92

Output:

- `MATCH`
- `FACE_MISMATCH`

Important limitation:

This is demo-grade face-template comparison, not production forensic biometric identity resolution. In production, replace the embedding model with a face-recognition model evaluated on the deployment population.

### Document Consistency

Status: implemented.

Checks:

- inconsistent birth dates
- underage or overage employment
- first salary before appointment
- confirmation or promotion before appointment
- duplicate document numbers
- missing required documents

This supports annual staff verification exercises where workers previously had to appear physically with old records.

## Bias And False Positive Controls

Lattice should avoid fully automated punishment. The system gates payment release and routes uncertain cases to review.

Controls:

- `REVIEW` verdict for incomplete evidence
- `REVIEW` band for scores 50-79
- audit logs for every flag
- plain-language anomaly explanations
- numeric anomaly contribution payloads for flagged workers
- runnable liveness bias audit endpoint with per-group FPR/FNR
- hard blocks only for high-risk conditions such as deepfake detection or repeated liveness failure
- human review path for BVN/name mismatches and borderline scores

Implemented audit endpoints:

- `POST /api/v1/ai/bias-audit/liveness`
- `POST /api/v1/ai/bias-audit/liveness/demo`

The demo audit uses deterministic synthetic Fitzpatrick IV-VI cases. It is useful for hackathon
evidence and threshold regression testing, but production deployment should run the same endpoint
with real consented field cases or a properly curated evaluation set.

## Nigerian Deployment Considerations

Connectivity:

- liveness should run client-side where possible
- rural workers may need retry/offline sync support

Device diversity:

- test MediaPipe on low-end Android devices
- track false rejection by device class

Skin tone and lighting:

- test liveness/deepfake error rates across Fitzpatrick IV-VI
- document FPR/FNR by group before production

Identity names:

- allow fuzzy name matching for common spelling/transliteration differences
- do not fail a worker solely because of a minor spelling mismatch

## What To Say To Judges

The system is intentionally conservative: AI can block obvious attacks, but ambiguous cases route to human review. This protects payroll funds without turning model uncertainty into automatic worker punishment.
