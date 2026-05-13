from pydantic import BaseModel


class FaceEmbeddingResponse(BaseModel):
    embedding: list[float]
    model_name: str
    model_version: str
    preprocessing: dict


class FaceCompareResponse(BaseModel):
    status: str
    similarity: float
    threshold: float
    model_name: str
    model_version: str
    reference_preprocessing: dict
    candidate_preprocessing: dict

