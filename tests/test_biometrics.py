from app.ai.biometrics import compare_biometric_templates
from app.core.scoring import BIOMETRIC_MISMATCH, VerificationSignals, compute_trust_score


def test_biometric_template_match_and_mismatch() -> None:
    enrolled = [0.1, 0.2, 0.4, 0.3, 0.8, 0.1, 0.7, 0.5]
    matched = [0.1, 0.21, 0.39, 0.31, 0.79, 0.1, 0.69, 0.49]
    mismatched = [0.9, -0.2, -0.4, 0.1, -0.8, 0.3, -0.7, 0.2]

    assert compare_biometric_templates(
        enrolled_vector=enrolled,
        captured_vector=matched,
        threshold=0.95,
    )["status"] == "BIOMETRIC_MATCH"
    assert compare_biometric_templates(
        enrolled_vector=enrolled,
        captured_vector=mismatched,
        threshold=0.95,
    )["status"] == "BIOMETRIC_MISMATCH"


def test_biometric_mismatch_penalizes_viq_score() -> None:
    score = compute_trust_score(
        VerificationSignals(
            liveness_status="PASSED",
            deepfake_status="CLEAN",
            biometric_status="BIOMETRIC_MISMATCH",
            bvn_status="BVN_MATCH",
        )
    )

    assert BIOMETRIC_MISMATCH in score.flags
    assert score.trust_score == 65
    assert score.verdict == "REVIEW"
