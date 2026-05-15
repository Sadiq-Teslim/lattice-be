# Lattice AI Worker Deployment

The production API is intentionally lightweight. It handles payroll records, sessions, VIQs,
document checks, anomaly scoring, Squad OTP, webhooks, and salary release. Heavy Torch/OpenCV
model inference lives in a separate AI worker.

## Main API

Use the existing `Dockerfile`.

Required Render settings:

- Dockerfile path: `Dockerfile`
- Start command: leave blank, the Dockerfile runs uvicorn
- `DATABASE_URL`: Render Postgres internal URL
- `PUBLIC_BACKEND_URL`: `https://lattice-be.onrender.com`
- `PUBLIC_FRONTEND_URL`: `https://lattice-be.vercel.app`
- `AI_WORKER_URL`: the AI worker Render URL, for example `https://lattice-ai.onrender.com`
- `AI_WORKER_API_KEY`: any shared secret, same value as the AI worker

The main API still exposes:

- `POST /api/v1/ai/deepfake/classify-frame`
- `POST /api/v1/ai/deepfake/classify-frames`
- `POST /api/v1/ai/face-match/embed`
- `POST /api/v1/ai/face-match/compare`

When `AI_WORKER_URL` is set, those endpoints proxy to the AI worker.

## AI Worker

Create a second Render web service from the same GitHub repo.

Settings:

- Dockerfile path: `Dockerfile.ai`
- Start command: leave blank
- `AI_WORKER_API_KEY`: same shared secret as the main API
- `DEEPFAKE_MODEL_PATH`: `models/deepfake/efficientnet_b0_ffpp_c23.pth`
- `PUBLIC_BACKEND_URL`: optional
- `PUBLIC_FRONTEND_URL`: optional

The AI worker image uses `requirements-ai.txt`, not the full backend dependency list. This keeps
Postgres, pandas, scikit-learn, and payroll-only packages out of the AI worker image. Torch and
torchvision are installed from the PyTorch CPU wheel index to avoid pulling CUDA wheels on Render.

Health check:

```text
GET /api/v1/health
```

Model checks:

```text
GET /api/v1/ai/deepfake/status
GET /api/v1/ai/face-match/status
```

## Consequences

- Main API deploys much faster because it no longer installs Torch, torchvision, or OpenCV.
- If the AI worker is down, payroll, documents, anomaly detection, VIQ generation, Squad OTP,
  and payment gating still work.
- Deepfake and server-side face matching return `503` through the main API until the AI worker
  is configured and healthy.
- Browser MediaPipe liveness is not affected because it runs on the frontend.
