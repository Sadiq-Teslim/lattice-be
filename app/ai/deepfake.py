from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageOps
from torchvision import models, transforms

from app.core.config import settings


class DeepfakeModelUnavailable(RuntimeError):
    pass


class DeepfakeDetector:
    def __init__(self, model_path: str | None = None, threshold: float | None = None) -> None:
        resolved_model_path = model_path or settings.deepfake_model_path
        if not resolved_model_path:
            raise DeepfakeModelUnavailable("DEEPFAKE_MODEL_PATH is required")
        self.model_path = Path(resolved_model_path)
        if not self.model_path.exists():
            raise DeepfakeModelUnavailable(f"deepfake model not found: {self.model_path}")

        self.threshold = threshold if threshold is not None else settings.deepfake_threshold
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = self._load_model()
        self.face_cascade = cv2.CascadeClassifier(
            str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
        )
        self.transform = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
            ]
        )

    def predict(self, image: Image.Image) -> dict:
        image = image.convert("RGB")
        crop, face_metadata = self._extract_face_crop(image)
        probability_fake = self._predict_probability(crop)

        status = "DEEPFAKE_DETECTED" if probability_fake >= self.threshold else "CLEAN"
        return {
            "status": status,
            "synthetic_probability": round(float(probability_fake), 6),
            "threshold": self.threshold,
            "model_name": "EfficientNet-B0",
            "model_version": "Xicor9/efficientnet-b0-ffpp-c23",
            "preprocessing": face_metadata,
        }

    def predict_many(self, images: list[Image.Image]) -> dict:
        if not images:
            raise ValueError("at least one frame is required")

        frame_results = [self.predict(image) for image in images]
        probabilities = [item["synthetic_probability"] for item in frame_results]
        mean_probability = sum(probabilities) / len(probabilities)
        max_probability = max(probabilities)
        aggregate_probability = max(mean_probability, max_probability * 0.85)
        status = "DEEPFAKE_DETECTED" if aggregate_probability >= self.threshold else "CLEAN"

        return {
            "status": status,
            "synthetic_probability": round(float(aggregate_probability), 6),
            "mean_synthetic_probability": round(float(mean_probability), 6),
            "max_synthetic_probability": round(float(max_probability), 6),
            "threshold": self.threshold,
            "frames_analyzed": len(frame_results),
            "model_name": "EfficientNet-B0",
            "model_version": "Xicor9/efficientnet-b0-ffpp-c23",
            "frame_results": frame_results,
        }

    def _predict_probability(self, image: Image.Image) -> float:
        augmented_images = [image, ImageOps.mirror(image)]
        tensors = torch.stack([self.transform(item) for item in augmented_images]).to(self.device)
        with torch.no_grad():
            logits = self.model(tensors)
            probabilities = torch.softmax(logits, dim=1)[:, 1]
        return float(probabilities.mean().item())

    def _extract_face_crop(self, image: Image.Image) -> tuple[Image.Image, dict]:
        array = np.array(image)
        gray = cv2.cvtColor(array, cv2.COLOR_RGB2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(48, 48),
        )
        if len(faces) == 0:
            return image, {
                "face_detected": False,
                "crop": "full_frame",
                "test_time_augmentation": "horizontal_flip_mean",
            }

        x, y, width, height = max(faces, key=lambda box: box[2] * box[3])
        margin = int(max(width, height) * 0.25)
        left = max(0, x - margin)
        top = max(0, y - margin)
        right = min(image.width, x + width + margin)
        bottom = min(image.height, y + height + margin)
        return image.crop((left, top, right, bottom)), {
            "face_detected": True,
            "crop": "largest_face_with_margin",
            "face_box": {
                "x": int(x),
                "y": int(y),
                "width": int(width),
                "height": int(height),
            },
            "crop_box": {
                "left": int(left),
                "top": int(top),
                "right": int(right),
                "bottom": int(bottom),
            },
            "test_time_augmentation": "horizontal_flip_mean",
        }

    def _load_model(self) -> torch.nn.Module:
        model = models.efficientnet_b0(weights=None)
        model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, 2)
        try:
            state_dict = torch.load(
                self.model_path,
                map_location=self.device,
                weights_only=True,
            )
        except TypeError:
            state_dict = torch.load(self.model_path, map_location=self.device)
        model.load_state_dict(state_dict)
        model.to(self.device)
        model.eval()
        return model


@lru_cache(maxsize=1)
def get_deepfake_detector() -> DeepfakeDetector:
    return DeepfakeDetector()
