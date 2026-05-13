from app.ai.bias_audit import evaluate_liveness_bias, generate_synthetic_liveness_cases


def test_synthetic_liveness_bias_audit_returns_group_metrics() -> None:
    cases = generate_synthetic_liveness_cases(
        live_cases_per_group=10,
        spoof_cases_per_group=10,
        seed=7,
    )

    result = evaluate_liveness_bias(cases)

    assert result.component == "liveness"
    assert len(result.groups) == 3
    assert all(group.cases == 20 for group in result.groups)
    assert result.max_fpr_gap is not None
    assert result.max_fnr_gap is not None
