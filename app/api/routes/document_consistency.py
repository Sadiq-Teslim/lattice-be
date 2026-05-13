from fastapi import APIRouter

from app.ai.document_consistency import evaluate_document_consistency
from app.schemas.document_consistency import (
    DocumentConsistencyRequest,
    DocumentConsistencyResponse,
)

router = APIRouter(prefix="/ai/document-consistency", tags=["ai"])


@router.post("/evaluate", response_model=DocumentConsistencyResponse)
def evaluate_documents(payload: DocumentConsistencyRequest) -> DocumentConsistencyResponse:
    return DocumentConsistencyResponse(**evaluate_document_consistency(payload))

