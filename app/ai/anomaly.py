from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


@dataclass(frozen=True)
class FeatureContribution:
    feature: str
    value: float
    baseline: float
    contribution: float
    direction: str


@dataclass(frozen=True)
class AnomalyScanResult:
    worker_code: str
    anomaly_score: float
    flagged: bool
    explanations: list[str]
    feature_contributions: list[FeatureContribution]
    explanation_method: str = "robust_zscore_contribution"


@dataclass(frozen=True)
class AnomalyEvaluationMetrics:
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int
    precision: float | None
    recall: float | None
    f1_score: float | None
    false_positive_rate: float | None


class PayrollAnomalyDetector:
    def __init__(self, contamination: float = 0.05, random_state: int = 42) -> None:
        self.contamination = contamination
        self.random_state = random_state

    def scan(self, records: list[dict]) -> list[AnomalyScanResult]:
        if len(records) < 20:
            raise ValueError("at least 20 payroll records are required for anomaly detection")

        frame = pd.DataFrame(records)
        features = build_feature_frame(frame)
        scaled = StandardScaler().fit_transform(features)
        model = IsolationForest(
            contamination=self.contamination,
            random_state=self.random_state,
            n_estimators=200,
        )
        predictions = model.fit_predict(scaled)
        scores = model.decision_function(scaled)
        baselines = features.median(numeric_only=True)
        std_devs = features.std(numeric_only=True).replace(0, 1.0).fillna(1.0)

        results: list[AnomalyScanResult] = []
        for index, row in frame.iterrows():
            feature_row = features.iloc[index]
            flagged = bool(predictions[index] == -1)
            results.append(
                AnomalyScanResult(
                    worker_code=str(row["worker_code"]),
                    anomaly_score=round(float(scores[index]), 6),
                    flagged=flagged,
                    explanations=explain_feature_row(feature_row) if flagged else [],
                    feature_contributions=explain_feature_contributions(
                        feature_row,
                        baselines,
                        std_devs,
                    )
                    if flagged
                    else [],
                )
            )

        return sorted(results, key=lambda item: item.anomaly_score)


def evaluate_anomaly_results(
    *,
    results: list[AnomalyScanResult],
    injected_ghost_lookup: dict[str, bool],
) -> AnomalyEvaluationMetrics:
    true_positives = false_positives = true_negatives = false_negatives = 0

    for result in results:
        actual_ghost = bool(injected_ghost_lookup.get(result.worker_code))
        if result.flagged and actual_ghost:
            true_positives += 1
        elif result.flagged and not actual_ghost:
            false_positives += 1
        elif not result.flagged and actual_ghost:
            false_negatives += 1
        else:
            true_negatives += 1

    precision = _safe_divide(true_positives, true_positives + false_positives)
    recall = _safe_divide(true_positives, true_positives + false_negatives)
    f1_score = (
        None
        if precision is None or recall is None or precision + recall == 0
        else round(2 * precision * recall / (precision + recall), 4)
    )
    false_positive_rate = _safe_divide(false_positives, false_positives + true_negatives)

    return AnomalyEvaluationMetrics(
        true_positives=true_positives,
        false_positives=false_positives,
        true_negatives=true_negatives,
        false_negatives=false_negatives,
        precision=precision,
        recall=recall,
        f1_score=f1_score,
        false_positive_rate=false_positive_rate,
    )


def build_feature_frame(frame: pd.DataFrame) -> pd.DataFrame:
    required = {
        "worker_code",
        "device_id",
        "gps_lat",
        "gps_lng",
        "registration_ip",
        "registration_timestamp",
        "bvn",
    }
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"missing required anomaly fields: {', '.join(sorted(missing))}")

    working = frame.copy()
    working["gps_lat_float"] = working["gps_lat"].map(_to_float)
    working["gps_lng_float"] = working["gps_lng"].map(_to_float)
    working["gps_cluster_key"] = (
        working["gps_lat_float"].round(3).astype(str)
        + ","
        + working["gps_lng_float"].round(3).astype(str)
    )
    working["ip_subnet"] = working["registration_ip"].fillna("").map(_subnet24)
    working["registration_minute"] = working["registration_timestamp"].map(_minute_bucket)

    return pd.DataFrame(
        {
            "device_id_frequency": _frequency(working["device_id"]),
            "gps_cluster_density": _frequency(working["gps_cluster_key"]),
            "gps_latitude": working["gps_lat_float"],
            "gps_longitude": working["gps_lng_float"],
            "bvn_collision_count": _frequency(working["bvn"]),
            "ip_subnet_overlap": _frequency(working["ip_subnet"]),
            "registration_burst_count": _frequency(working["registration_minute"]),
            "registration_epoch_seconds": working["registration_timestamp"].map(_epoch_seconds),
        }
    )


def explain_feature_row(row: pd.Series) -> list[str]:
    explanations: list[str] = []

    if row["device_id_frequency"] >= 3:
        explanations.append(f"device shared by {int(row['device_id_frequency'])} workers")
    if row["gps_cluster_density"] >= 5:
        explanations.append(f"GPS cluster reused by {int(row['gps_cluster_density'])} workers")
    if row["bvn_collision_count"] >= 2:
        explanations.append(f"BVN appears on {int(row['bvn_collision_count'])} payroll records")
    if row["ip_subnet_overlap"] >= 5:
        explanations.append(f"IP subnet shared by {int(row['ip_subnet_overlap'])} workers")
    if row["registration_burst_count"] >= 5:
        explanations.append(
            f"{int(row['registration_burst_count'])} workers registered in the same minute"
        )

    return explanations or ["combined payroll metadata is statistically unusual"]


def explain_feature_contributions(
    row: pd.Series,
    baselines: pd.Series,
    std_devs: pd.Series,
    *,
    limit: int = 5,
) -> list[FeatureContribution]:
    contributions: list[FeatureContribution] = []
    for feature, raw_value in row.items():
        value = float(raw_value)
        baseline = float(baselines[feature])
        std_dev = float(std_devs[feature]) or 1.0
        signed_contribution = (value - baseline) / std_dev
        contributions.append(
            FeatureContribution(
                feature=str(feature),
                value=round(value, 6),
                baseline=round(baseline, 6),
                contribution=round(abs(float(signed_contribution)), 6),
                direction="HIGH" if signed_contribution >= 0 else "LOW",
            )
        )

    return sorted(contributions, key=lambda item: item.contribution, reverse=True)[:limit]


def _frequency(series: pd.Series) -> pd.Series:
    return series.map(series.value_counts()).fillna(0).astype(float)


def _subnet24(value: str) -> str:
    parts = value.split(".")
    if len(parts) < 3:
        return value
    return ".".join(parts[:3])


def _minute_bucket(value: object) -> str:
    if isinstance(value, datetime):
        return value.replace(second=0, microsecond=0).isoformat()
    parsed = pd.to_datetime(value)
    return parsed.replace(second=0, microsecond=0).isoformat()


def _epoch_seconds(value: object) -> float:
    parsed = pd.to_datetime(value)
    return float(parsed.timestamp())


def _to_float(value: object) -> float:
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _safe_divide(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)
