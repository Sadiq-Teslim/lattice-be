from fastapi import APIRouter

from app.ai.bias_audit import evaluate_liveness_bias, generate_synthetic_liveness_cases
from app.schemas.bias_audit import BiasAuditDemoRequest, BiasAuditRequest, BiasAuditResponse

router = APIRouter(prefix="/ai/bias-audit", tags=["ai"])


@router.post("/liveness", response_model=BiasAuditResponse)
def audit_liveness_bias(payload: BiasAuditRequest) -> BiasAuditResponse:
    return evaluate_liveness_bias(payload.cases)


@router.post("/liveness/demo", response_model=BiasAuditResponse)
def audit_demo_liveness_bias(payload: BiasAuditDemoRequest) -> BiasAuditResponse:
    cases = generate_synthetic_liveness_cases(
        live_cases_per_group=payload.live_cases_per_group,
        spoof_cases_per_group=payload.spoof_cases_per_group,
        seed=payload.seed,
    )
    return evaluate_liveness_bias(cases)
