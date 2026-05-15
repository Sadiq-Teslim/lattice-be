from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.schemas.deepfake import DeepfakeBatchInferenceResponse, DeepfakeInferenceResponse
from app.services.ai_worker import (
    AIWorkerUnavailable,
    ai_worker_configured,
    ai_worker_get,
    ai_worker_post_files,
)

router = APIRouter(prefix="/ai/deepfake", tags=["ai"])
upload_file = File(...)
upload_files = File(...)


@router.get("/status")
async def deepfake_model_status() -> dict[str, str]:
    if ai_worker_configured():
        try:
            return await ai_worker_get("/ai/deepfake/status")
        except AIWorkerUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    try:
        detector = _get_deepfake_detector()
    except DeepfakeModelUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return {
        "status": "ready",
        "model_name": "EfficientNet-B0",
        "model_version": "Xicor9/efficientnet-b0-ffpp-c23",
        "device": str(detector.device),
    }


@router.post("/classify-frame", response_model=DeepfakeInferenceResponse)
async def classify_frame(file: UploadFile = upload_file) -> DeepfakeInferenceResponse:
    content = await file.read()
    if ai_worker_configured():
        try:
            payload = await ai_worker_post_files(
                "/ai/deepfake/classify-frame",
                [("file", (file.filename or "frame.jpg", content, file.content_type or "application/octet-stream"))],
            )
        except AIWorkerUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        return DeepfakeInferenceResponse(**payload)

    try:
        detector = _get_deepfake_detector()
    except DeepfakeModelUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    try:
        image = Image.open(BytesIO(content))
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="uploaded file is not a valid image",
        ) from exc

    return DeepfakeInferenceResponse(**detector.predict(image))


@router.post("/classify-frames", response_model=DeepfakeBatchInferenceResponse)
async def classify_frames(files: list[UploadFile] = upload_files) -> DeepfakeBatchInferenceResponse:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="at least one frame is required",
        )
    uploaded = [(file, await file.read()) for file in files[:10]]
    if ai_worker_configured():
        try:
            payload = await ai_worker_post_files(
                "/ai/deepfake/classify-frames",
                [
                    (
                        "files",
                        (
                            file.filename or "frame.jpg",
                            content,
                            file.content_type or "application/octet-stream",
                        ),
                    )
                    for file, content in uploaded
                ],
            )
        except AIWorkerUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        return DeepfakeBatchInferenceResponse(**payload)

    try:
        detector = _get_deepfake_detector()
    except DeepfakeModelUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    images: list[Image.Image] = []
    for file, content in uploaded:
        try:
            images.append(Image.open(BytesIO(content)))
        except UnidentifiedImageError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{file.filename} is not a valid image",
            ) from exc

    return DeepfakeBatchInferenceResponse(**detector.predict_many(images))


def _get_deepfake_detector():
    try:
        from app.ai.deepfake import DeepfakeModelUnavailable as LocalDeepfakeUnavailable
        from app.ai.deepfake import get_deepfake_detector
    except ImportError as exc:
        raise DeepfakeModelUnavailable(
            "deepfake model dependencies are not installed on this service; configure AI_WORKER_URL"
        ) from exc
    try:
        return get_deepfake_detector()
    except LocalDeepfakeUnavailable as exc:
        raise DeepfakeModelUnavailable(str(exc)) from exc


class DeepfakeModelUnavailable(RuntimeError):
    pass
