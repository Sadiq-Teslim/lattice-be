from fastapi import APIRouter

from app.api.routes import (
    admin,
    bias_audit,
    deepfake,
    demo,
    document_consistency,
    face_match,
    health,
    jobs,
    liveness,
    mfa,
    pay_cycles,
    sdk,
    squad,
    verification,
    viq,
    webhooks,
    workers,
)

api_router = APIRouter()
api_router.include_router(admin.router)
api_router.include_router(bias_audit.router)
api_router.include_router(deepfake.router)
api_router.include_router(demo.router)
api_router.include_router(document_consistency.router)
api_router.include_router(face_match.router)
api_router.include_router(pay_cycles.router)
api_router.include_router(liveness.router)
api_router.include_router(mfa.router)
api_router.include_router(sdk.router)
api_router.include_router(squad.router)
api_router.include_router(verification.router)
api_router.include_router(viq.router)
api_router.include_router(webhooks.router)
api_router.include_router(workers.router)
api_router.include_router(health.router, tags=["health"])
api_router.include_router(jobs.router)
