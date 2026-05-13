from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.ai.deepfake import DeepfakeModelUnavailable, get_deepfake_detector
from app.schemas.deepfake import DeepfakeBatchInferenceResponse, DeepfakeInferenceResponse

router = APIRouter(prefix="/ai/deepfake", tags=["ai"])
upload_file = File(...)
upload_files = File(...)


@router.get("/status")
def deepfake_model_status() -> dict[str, str]:
    try:
        detector = get_deepfake_detector()
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
    try:
        detector = get_deepfake_detector()
    except DeepfakeModelUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    content = await file.read()
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
    try:
        detector = get_deepfake_detector()
    except DeepfakeModelUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    images: list[Image.Image] = []
    for file in files[:10]:
        content = await file.read()
        try:
            images.append(Image.open(BytesIO(content)))
        except UnidentifiedImageError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{file.filename} is not a valid image",
            ) from exc

    return DeepfakeBatchInferenceResponse(**detector.predict_many(images))
