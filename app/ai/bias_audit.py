import random
from collections import defaultdict

from app.ai.liveness import evaluate_liveness
from app.schemas.bias_audit import BiasAuditCase, BiasAuditResponse, BiasGroupMetrics
from app.schemas.liveness import LivenessChallengeResult


def evaluate_liveness_bias(cases: list[BiasAuditCase]) -> BiasAuditResponse:
    if not cases:
        return BiasAuditResponse(
            component="liveness",
            groups=[],
            max_fpr_gap=None,
            max_fnr_gap=None,
            threshold_met=False,
            notes=["no audit cases supplied"],
        )

    buckets: dict[str, dict[str, int]] = defaultdict(
        lambda: {"tp": 0, "fp": 0, "tn": 0, "fn": 0, "cases": 0}
    )
    for item in cases:
        predicted_live = evaluate_liveness(item.liveness)["status"] == "PASSED"
        bucket = buckets[item.group]
        bucket["cases"] += 1
        if predicted_live and item.expected_live:
            bucket["tp"] += 1
        elif predicted_live and not item.expected_live:
            bucket["fp"] += 1
        elif not predicted_live and not item.expected_live:
            bucket["tn"] += 1
        else:
            bucket["fn"] += 1

    groups = [
        BiasGroupMetrics(
            group=group,
            cases=values["cases"],
            true_positives=values["tp"],
            false_positives=values["fp"],
            true_negatives=values["tn"],
            false_negatives=values["fn"],
            false_positive_rate=_safe_rate(values["fp"], values["fp"] + values["tn"]),
            false_negative_rate=_safe_rate(values["fn"], values["fn"] + values["tp"]),
        )
        for group, values in sorted(buckets.items())
    ]
    fprs = [item.false_positive_rate for item in groups if item.false_positive_rate is not None]
    fnrs = [item.false_negative_rate for item in groups if item.false_negative_rate is not None]
    max_fpr_gap = _gap(fprs)
    max_fnr_gap = _gap(fnrs)

    return BiasAuditResponse(
        component="liveness",
        groups=groups,
        max_fpr_gap=max_fpr_gap,
        max_fnr_gap=max_fnr_gap,
        threshold_met=all(
            gap is not None and gap <= 0.03
            for gap in [max_fpr_gap, max_fnr_gap]
        ),
        notes=[
            "Synthetic audit harness for threshold checking across Fitzpatrick IV-VI groups.",
            "Use field or curated image/video cases before production deployment.",
        ],
    )


def generate_synthetic_liveness_cases(
    *,
    live_cases_per_group: int,
    spoof_cases_per_group: int,
    seed: int,
) -> list[BiasAuditCase]:
    rng = random.Random(seed)
    cases: list[BiasAuditCase] = []
    for group_index, group in enumerate(["Fitzpatrick IV", "Fitzpatrick V", "Fitzpatrick VI"]):
        confidence_shift = group_index * -0.005
        for index in range(live_cases_per_group):
            cases.append(
                BiasAuditCase(
                    case_id=f"{group}-live-{index}",
                    group=group,
                    expected_live=True,
                    liveness=LivenessChallengeResult(
                        blink_count=2 + rng.randint(0, 2),
                        head_turn_degrees=15 + rng.random() * 12,
                        confidence=min(0.99, 0.82 + rng.random() * 0.16 + confidence_shift),
                        attempts=1,
                    ),
                )
            )
        for index in range(spoof_cases_per_group):
            spoof_kind = rng.choice(["no_blink", "flat_head", "low_confidence"])
            blink_count = 0 if spoof_kind == "no_blink" else rng.randint(1, 2)
            head_turn = 5 + rng.random() * 8 if spoof_kind == "flat_head" else 16 + rng.random() * 8
            confidence = 0.55 + rng.random() * 0.15 if spoof_kind == "low_confidence" else 0.76
            cases.append(
                BiasAuditCase(
                    case_id=f"{group}-spoof-{index}",
                    group=group,
                    expected_live=False,
                    liveness=LivenessChallengeResult(
                        blink_count=blink_count,
                        head_turn_degrees=head_turn,
                        confidence=confidence,
                        attempts=1,
                    ),
                )
            )
    return cases


def _safe_rate(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)


def _gap(values: list[float]) -> float | None:
    if not values:
        return None
    return round(max(values) - min(values), 4)
