from dataclasses import dataclass, field

LIVENESS_FAIL = "LIVENESS_FAIL"
DEEPFAKE_DETECTED = "DEEPFAKE_DETECTED"
FACE_MISMATCH = "FACE_MISMATCH"
ANOMALY_FLAGGED = "ANOMALY_FLAGGED"
BVN_MISMATCH = "BVN_MISMATCH"
LIVENESS_UNVERIFIED = "LIVENESS_UNVERIFIED"
DEEPFAKE_UNVERIFIED = "DEEPFAKE_UNVERIFIED"
BVN_UNVERIFIED = "BVN_UNVERIFIED"
DOCUMENT_INCONSISTENCY = "DOCUMENT_INCONSISTENCY"

PASS = "PASS"
REVIEW = "REVIEW"
FAIL = "FAIL"


@dataclass(frozen=True)
class VerificationSignals:
    liveness_status: str | None = None
    liveness_attempts: int = 0
    deepfake_status: str | None = None
    face_match_status: str | None = None
    anomaly_flagged: bool = False
    bvn_status: str | None = None
    document_status: str | None = None


@dataclass(frozen=True)
class ScoreBreakdown:
    trust_score: int
    verdict: str
    flags: list[str] = field(default_factory=list)
    deductions: dict[str, int] = field(default_factory=dict)
    hard_block: bool = False


def compute_trust_score(signals: VerificationSignals) -> ScoreBreakdown:
    score = 100
    flags: list[str] = []
    deductions: dict[str, int] = {}
    hard_block = False

    liveness_status = _normalize(signals.liveness_status)
    deepfake_status = _normalize(signals.deepfake_status)
    face_match_status = _normalize(signals.face_match_status)
    bvn_status = _normalize(signals.bvn_status)
    document_status = _normalize(signals.document_status)

    if liveness_status is None:
        flags.append(LIVENESS_UNVERIFIED)
    elif liveness_status in {"FAILED", "LIVENESS_FAIL"}:
        score = _deduct(score, deductions, LIVENESS_FAIL, 40)
        flags.append(LIVENESS_FAIL)
        if signals.liveness_attempts >= 3:
            hard_block = True

    if deepfake_status is None:
        flags.append(DEEPFAKE_UNVERIFIED)
    elif deepfake_status == DEEPFAKE_DETECTED:
        score = _deduct(score, deductions, DEEPFAKE_DETECTED, 50)
        flags.append(DEEPFAKE_DETECTED)
        hard_block = True

    if face_match_status == FACE_MISMATCH:
        score = _deduct(score, deductions, FACE_MISMATCH, 30)
        flags.append(FACE_MISMATCH)

    if signals.anomaly_flagged:
        score = _deduct(score, deductions, ANOMALY_FLAGGED, 20)
        flags.append(ANOMALY_FLAGGED)

    if bvn_status is None:
        flags.append(BVN_UNVERIFIED)
    elif bvn_status == BVN_MISMATCH:
        score = _deduct(score, deductions, BVN_MISMATCH, 25)
        flags.append(BVN_MISMATCH)

    if document_status == DOCUMENT_INCONSISTENCY:
        score = _deduct(score, deductions, DOCUMENT_INCONSISTENCY, 20)
        flags.append(DOCUMENT_INCONSISTENCY)

    score = max(0, min(100, score))
    verdict = _verdict(score=score, hard_block=hard_block, flags=flags)
    return ScoreBreakdown(
        trust_score=score,
        verdict=verdict,
        flags=flags,
        deductions=deductions,
        hard_block=hard_block,
    )


def _deduct(score: int, deductions: dict[str, int], flag: str, points: int) -> int:
    deductions[flag] = points
    return score - points


def _verdict(*, score: int, hard_block: bool, flags: list[str]) -> str:
    if hard_block or score < 50:
        return FAIL
    if _has_unverified_required_signal(flags):
        return REVIEW
    if score >= 80:
        return PASS
    return REVIEW


def _has_unverified_required_signal(flags: list[str]) -> bool:
    return any(flag in flags for flag in {LIVENESS_UNVERIFIED, DEEPFAKE_UNVERIFIED, BVN_UNVERIFIED})


def _normalize(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None
