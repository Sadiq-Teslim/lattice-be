# Judging Alignment

## AI Technical Depth

Implemented:

- Isolation Forest payroll anomaly detection
- EfficientNet-B0 deepfake inference with face-aware preprocessing and multi-frame aggregation
- MediaPipe liveness browser client and backend contract
- document consistency engine for annual staff verification
- liveness fairness/bias audit endpoint with FPR/FNR by group
- numeric anomaly feature contribution explanations
- Trust Score and VIQ decision engine

## Squad API Integration

Implemented:

- Squad account lookup wrapper
- Squad virtual account creation wrapper
- Squad transfer wrapper
- Squad webhook signature validation
- Squad SMS OTP wrapper

Current blocker:

- Merchant `SBG2LNMMCL` reaches Squad sandbox but is not yet eligible for transfer/account-lookup endpoints.

## Problem Relevance

Target problem:

- ghost workers on Nigerian government payrolls

Target user:

- ministry or agency HR/payroll administrator

Core artifact:

- signed Verifiable Institutional Quote per worker per pay cycle

## Scalability

Design:

- FastAPI backend
- PostgreSQL default deployment
- one-call SDK endpoint
- persistent queued SDK verification endpoint
- SQLite local proof fallback
- audit logs
- one VIQ per worker per pay cycle
- Squad webhook closes payment loop

## Demo Readiness

Available scripts:

- `python scripts/runtime_proof.py`
- `python scripts/demo_e2e.py`
- `python scripts/squad_smoke.py`

Available public tunnel:

```text
https://uncompassionate-port.outray.app
```

Webhook URL:

```text
https://uncompassionate-port.outray.app/api/v1/webhooks/squad
```
