from app.schemas.liveness import LivenessChallengeResult


def evaluate_liveness(payload: LivenessChallengeResult) -> dict:
    reasons: list[str] = []

    if payload.blink_count < 1:
        reasons.append("blink challenge failed")
    if abs(payload.head_turn_degrees) < 12:
        reasons.append("head-turn challenge failed")
    if payload.confidence < 0.68:
        reasons.append("liveness confidence below threshold")

    status = "PASSED" if not reasons else "FAILED"
    return {
        "status": status,
        "confidence": payload.confidence,
        "attempts": payload.attempts,
        "challenge": payload.challenge,
        "reasons": reasons,
    }
