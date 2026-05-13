from pydantic import BaseModel


class DeepfakeInferenceResponse(BaseModel):
    status: str
    synthetic_probability: float
    threshold: float
    model_name: str
    model_version: str
    preprocessing: dict


class DeepfakeBatchInferenceResponse(BaseModel):
    status: str
    synthetic_probability: float
    mean_synthetic_probability: float
    max_synthetic_probability: float
    threshold: float
    frames_analyzed: int
    model_name: str
    model_version: str
    frame_results: list[DeepfakeInferenceResponse]
