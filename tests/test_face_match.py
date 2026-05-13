import numpy as np

from app.ai.face_match import compare_templates, cosine_similarity


def test_cosine_similarity_identical_vectors() -> None:
    vector = np.array([1.0, 2.0, 3.0], dtype=np.float32)

    assert round(cosine_similarity(vector, vector), 6) == 1.0


def test_compare_templates_flags_mismatch() -> None:
    result = compare_templates(
        reference_template={"embedding": [1.0, 0.0, 0.0], "model_name": "test"},
        candidate_template={"embedding": [0.0, 1.0, 0.0], "model_name": "test"},
        threshold=0.92,
    )

    assert result["status"] == "FACE_MISMATCH"
    assert result["similarity"] == 0.0


def test_compare_templates_accepts_match() -> None:
    result = compare_templates(
        reference_template={"embedding": [1.0, 0.0, 0.0], "model_name": "test"},
        candidate_template={"embedding": [0.95, 0.05, 0.0], "model_name": "test"},
        threshold=0.92,
    )

    assert result["status"] == "MATCH"
