from app.ai.anomaly import PayrollAnomalyDetector, evaluate_anomaly_results
from app.ai.synthetic_data import SyntheticPayrollConfig, generate_synthetic_payroll


def test_synthetic_ghost_clusters_are_detected() -> None:
    frame = generate_synthetic_payroll(SyntheticPayrollConfig(count=1000, ghost_count=50, seed=42))
    records = frame.to_dict(orient="records")
    results = PayrollAnomalyDetector(contamination=0.05).scan(records)

    ghost_codes = {
        row["worker_code"]
        for row in records
        if row["risk_metadata"]["is_injected_ghost"]
    }
    flagged_codes = {result.worker_code for result in results if result.flagged}
    first_flagged = next(result for result in results if result.flagged)

    assert len(flagged_codes) == 50
    assert ghost_codes.issubset(flagged_codes)
    assert first_flagged.feature_contributions
    assert first_flagged.explanation_method == "robust_zscore_contribution"

    metrics = evaluate_anomaly_results(
        results=results,
        injected_ghost_lookup={
            code: code in ghost_codes
            for code in {row["worker_code"] for row in records}
        },
    )

    assert metrics.true_positives == 50
    assert metrics.false_positives == 0
    assert metrics.false_negatives == 0
    assert metrics.precision == 1.0
    assert metrics.recall == 1.0
    assert metrics.f1_score == 1.0
