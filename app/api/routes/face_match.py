from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.schemas.face_match import FaceCompareResponse, FaceEmbeddingResponse
from app.services.ai_worker import (
    AIWorkerUnavailable,
    ai_worker_configured,
    ai_worker_get,
    ai_worker_post_files,
)

router = APIRouter(prefix="/ai/face-match", tags=["ai"])
upload_file = File(...)
reference_upload = File(...)
candidate_upload = File(...)


@router.get("/status")
async def face_match_status() -> dict[str, str]:
    if ai_worker_configured():
        try:
            return await ai_worker_get("/ai/face-match/status")
        except AIWorkerUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    try:
        service = _get_face_embedding_service()
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
    content = await file.read()
    if ai_worker_configured():
        try:
            payload = await ai_worker_post_files(
                "/ai/face-match/embed",
                [("file", (file.filename or "face.jpg", content, file.content_type or "application/octet-stream"))],
            )
        except AIWorkerUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        return FaceEmbeddingResponse(**payload)

    image = _read_image_bytes(file, content)
    try:
        service = _get_face_embedding_service()
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
    reference_content = await reference.read()
    candidate_content = await candidate.read()
    if ai_worker_configured():
        try:
            payload = await ai_worker_post_files(
                "/ai/face-match/compare",
                [
                    (
                        "reference",
                        (
                            reference.filename or "reference.jpg",
                            reference_content,
                            reference.content_type or "application/octet-stream",
                        ),
                    ),
                    (
                        "candidate",
                        (
                            candidate.filename or "candidate.jpg",
                            candidate_content,
                            candidate.content_type or "application/octet-stream",
                        ),
                    ),
                ],
            )
        except AIWorkerUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        return FaceCompareResponse(**payload)

    reference_image = _read_image_bytes(reference, reference_content)
    candidate_image = _read_image_bytes(candidate, candidate_content)
    try:
        service = _get_face_embedding_service()
    except FaceMatchUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return FaceCompareResponse(**service.compare(reference_image, candidate_image))


def _read_image_bytes(file: UploadFile, content: bytes) -> Image.Image:
    try:
        return Image.open(BytesIO(content)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{file.filename} is not a valid image",
        ) from exc


def _get_face_embedding_service():
    try:
        from app.ai.face_match import FaceMatchUnavailable as LocalFaceMatchUnavailable
        from app.ai.face_match import get_face_embedding_service
    except ImportError as exc:
        raise FaceMatchUnavailable(
            "face-match dependencies are not installed on this service; configure AI_WORKER_URL"
        ) from exc
    try:
        return get_face_embedding_service()
    except LocalFaceMatchUnavailable as exc:
        raise FaceMatchUnavailable(str(exc)) from exc


class FaceMatchUnavailable(RuntimeError):
    pass
