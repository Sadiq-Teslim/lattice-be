from app.ai.liveness import evaluate_liveness
from app.schemas.liveness import LivenessChallengeResult


def test_liveness_passes_valid_challenge_result() -> None:
    result = evaluate_liveness(
        LivenessChallengeResult(
            blink_count=2,
            head_turn_degrees=18,
            confidence=0.91,
            attempts=1,
        )
    )

    assert result["status"] == "PASSED"
    assert result["reasons"] == []


def test_liveness_fails_weak_challenge_result() -> None:
    result = evaluate_liveness(
        LivenessChallengeResult(
            blink_count=1,
            head_turn_degrees=5,
            confidence=0.5,
            attempts=1,
        )
    )

    assert result["status"] == "FAILED"
    assert result["reasons"] == [
        "blink challenge failed",
        "head-turn challenge failed",
        "liveness confidence below threshold",
    ]

