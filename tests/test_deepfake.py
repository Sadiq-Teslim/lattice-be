from PIL import Image

from app.ai.deepfake import DeepfakeDetector


class TinyDeepfakeDetector(DeepfakeDetector):
    def __init__(self) -> None:
        self.threshold = 0.85
        self.device = "cpu"
        self.face_cascade = None

    def _predict_probability(self, image: Image.Image) -> float:
        return 0.9 if image.width > 0 and image.height > 0 else 0.0

    def _extract_face_crop(self, image: Image.Image):
        return image, {
            "face_detected": False,
            "crop": "full_frame",
            "test_time_augmentation": "horizontal_flip_mean",
        }


def test_deepfake_predict_includes_preprocessing_metadata() -> None:
    detector = TinyDeepfakeDetector()
    result = detector.predict(Image.new("RGB", (32, 32)))

    assert result["status"] == "DEEPFAKE_DETECTED"
    assert result["synthetic_probability"] == 0.9
    assert result["preprocessing"]["crop"] == "full_frame"


def test_deepfake_predict_many_aggregates_frames() -> None:
    detector = TinyDeepfakeDetector()
    result = detector.predict_many([Image.new("RGB", (32, 32)), Image.new("RGB", (64, 64))])

    assert result["status"] == "DEEPFAKE_DETECTED"
    assert result["frames_analyzed"] == 2
    assert len(result["frame_results"]) == 2
