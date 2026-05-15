from math import sqrt
from typing import Literal


BiometricModality = Literal["face", "fingerprint", "iris", "voice"]


class BiometricTemplateError(ValueError):
    pass


def compare_biometric_templates(
    *,
    enrolled_vector: list[float],
    captured_vector: list[float],
    threshold: float = 0.86,
) -> dict:
    _validate_vector(enrolled_vector, name="enrolled_template")
    _validate_vector(captured_vector, name="captured_template")
    if len(enrolled_vector) != len(captured_vector):
        raise BiometricTemplateError("biometric templates must have the same vector length")

    similarity = _cosine_similarity(enrolled_vector, captured_vector)
    return {
        "status": "BIOMETRIC_MATCH" if similarity >= threshold else "BIOMETRIC_MISMATCH",
        "similarity": round(similarity, 6),
        "threshold": threshold,
        "model_name": "Lattice Biometric Template Comparator",
        "model_version": "cosine-v1",
    }


def biometric_quality(vector: list[float]) -> dict:
    _validate_vector(vector, name="template")
    magnitude = sqrt(sum(value * value for value in vector))
    zero_ratio = sum(1 for value in vector if abs(value) < 1e-9) / len(vector)
    return {
        "dimension": len(vector),
        "magnitude": round(magnitude, 6),
        "zero_ratio": round(zero_ratio, 6),
        "usable": magnitude > 0.01 and zero_ratio < 0.95,
    }


def _validate_vector(vector: list[float], *, name: str) -> None:
    if not vector:
        raise BiometricTemplateError(f"{name} cannot be empty")
    if len(vector) < 8:
        raise BiometricTemplateError(f"{name} must contain at least 8 numeric features")
    if any(not isinstance(value, int | float) for value in vector):
        raise BiometricTemplateError(f"{name} must contain only numeric features")


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    denominator = left_norm * right_norm
    if denominator == 0:
        return 0.0
    return numerator / denominator
