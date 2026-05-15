from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from app.core.config import settings


class FaceMatchUnavailable(RuntimeError):
    pass


class FaceEmbeddingService:
    def __init__(self, threshold: float | None = None) -> None:
        try:
            import cv2
            import torch
            from torchvision import transforms
        except ImportError as exc:
            raise FaceMatchUnavailable(f"face-match dependencies are not installed: {exc}") from exc

        self._cv2 = cv2
        self._torch = torch
        self.threshold = threshold if threshold is not None else settings.face_match_threshold
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.face_cascade = cv2.CascadeClassifier(
            str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
        )
        self.model = self._load_model()
        self.transform = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225],
                ),
            ]
        )

    def embed(self, image: Image.Image) -> dict:
        crop, metadata = self._extract_face_crop(image.convert("RGB"))
        tensor = self.transform(crop).unsqueeze(0).to(self.device)
        with self._torch.no_grad():
            vector = self.model(tensor).squeeze(0)
        vector = self._torch.nn.functional.normalize(vector, dim=0).cpu().numpy()
        return {
            "embedding": [round(float(value), 8) for value in vector.tolist()],
            "model_name": "MobileNetV3-Small",
            "model_version": "torchvision-imagenet-features",
            "preprocessing": metadata,
        }

    def compare(self, reference: Image.Image, candidate: Image.Image) -> dict:
        reference_template = self.embed(reference)
        candidate_template = self.embed(candidate)
        return compare_templates(
            reference_template=reference_template,
            candidate_template=candidate_template,
            threshold=self.threshold,
        )

    def _load_model(self) -> Any:
        from torchvision import models

        try:
            model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        except Exception as exc:
            raise FaceMatchUnavailable(f"face embedding model could not load: {exc}") from exc
        model.classifier = torch.nn.Identity()
        model.to(self.device)
        model.eval()
        return model

    def _extract_face_crop(self, image: Image.Image) -> tuple[Image.Image, dict]:
        array = np.array(image)
        gray = self._cv2.cvtColor(array, self._cv2.COLOR_RGB2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(48, 48),
        )
        if len(faces) == 0:
            return image, {"face_detected": False, "crop": "full_frame"}

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
        }


def compare_templates(
    *,
    reference_template: dict,
    candidate_template: dict,
    threshold: float,
) -> dict:
    reference = np.array(reference_template["embedding"], dtype=np.float32)
    candidate = np.array(candidate_template["embedding"], dtype=np.float32)
    similarity = cosine_similarity(reference, candidate)
    status = "MATCH" if similarity >= threshold else "FACE_MISMATCH"
    return {
        "status": status,
        "similarity": round(float(similarity), 6),
        "threshold": threshold,
        "model_name": reference_template.get("model_name", "unknown"),
        "model_version": reference_template.get("model_version", "unknown"),
        "reference_preprocessing": reference_template.get("preprocessing", {}),
        "candidate_preprocessing": candidate_template.get("preprocessing", {}),
    }


def cosine_similarity(reference: np.ndarray, candidate: np.ndarray) -> float:
    denominator = float(np.linalg.norm(reference) * np.linalg.norm(candidate))
    if denominator == 0:
        return 0.0
    return float(np.dot(reference, candidate) / denominator)


@lru_cache(maxsize=1)
def get_face_embedding_service() -> FaceEmbeddingService:
    return FaceEmbeddingService()
