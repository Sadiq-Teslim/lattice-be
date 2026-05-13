from app.core.scoring import VerificationSignals, compute_trust_score


def test_clean_verified_worker_passes() -> None:
    score = compute_trust_score(
        VerificationSignals(
            liveness_status="PASSED",
            deepfake_status="CLEAN",
            bvn_status="BVN_MATCH",
        )
    )

    assert score.trust_score == 100
    assert score.verdict == "PASS"
    assert score.flags == []


def test_deepfake_hard_blocks_payment() -> None:
    score = compute_trust_score(
        VerificationSignals(
            liveness_status="PASSED",
            deepfake_status="DEEPFAKE_DETECTED",
            bvn_status="BVN_MATCH",
        )
    )

    assert score.trust_score == 50
    assert score.verdict == "FAIL"
    assert score.hard_block is True
    assert "DEEPFAKE_DETECTED" in score.flags


def test_missing_required_evidence_routes_to_review() -> None:
    score = compute_trust_score(VerificationSignals())

    assert score.trust_score == 100
    assert score.verdict == "REVIEW"
    assert score.flags == ["LIVENESS_UNVERIFIED", "DEEPFAKE_UNVERIFIED", "BVN_UNVERIFIED"]


def test_anomaly_penalty_still_passes_when_other_signals_are_clean() -> None:
    score = compute_trust_score(
        VerificationSignals(
            liveness_status="PASSED",
            deepfake_status="CLEAN",
            anomaly_flagged=True,
            bvn_status="BVN_MATCH",
        )
    )

    assert score.trust_score == 80
    assert score.verdict == "PASS"
    assert score.flags == ["ANOMALY_FLAGGED"]


def test_document_inconsistency_penalizes_trust_score() -> None:
    score = compute_trust_score(
        VerificationSignals(
            liveness_status="PASSED",
            deepfake_status="CLEAN",
            bvn_status="BVN_MATCH",
            document_status="DOCUMENT_INCONSISTENCY",
        )
    )

    assert score.trust_score == 80
    assert score.verdict == "PASS"
    assert score.flags == ["DOCUMENT_INCONSISTENCY"]
