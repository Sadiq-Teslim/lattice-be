from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.ai.face_match import FaceMatchUnavailable, get_face_embedding_service
from app.schemas.face_match import FaceCompareResponse, FaceEmbeddingResponse

router = APIRouter(prefix="/ai/face-match", tags=["ai"])
upload_file = File(...)
reference_upload = File(...)
candidate_upload = File(...)


@router.get("/status")
def face_match_status() -> dict[str, str]:
    try:
        service = get_face_embedding_service()
    except FaceMatchUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return {
        "status": "ready",
        "model_name": "MobileNetV3-Small",
        "model_version": "torchvision-imagenet-features",
        "device": str(service.device),
    }


@router.post("/embed", response_model=FaceEmbeddingResponse)
async def embed_face(file: UploadFile = upload_file) -> FaceEmbeddingResponse:
    image = await _read_image(file)
    try:
        service = get_face_embedding_service()
    except FaceMatchUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return FaceEmbeddingResponse(**service.embed(image))


@router.post("/compare", response_model=FaceCompareResponse)
async def compare_faces(
    reference: UploadFile = reference_upload,
    candidate: UploadFile = candidate_upload,
) -> FaceCompareResponse:
    reference_image = await _read_image(reference)
    candidate_image = await _read_image(candidate)
    try:
        service = get_face_embedding_service()
    except FaceMatchUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return FaceCompareResponse(**service.compare(reference_image, candidate_image))


async def _read_image(file: UploadFile) -> Image.Image:
    content = await file.read()
    try:
        return Image.open(BytesIO(content)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{file.filename} is not a valid image",
        ) from exc

