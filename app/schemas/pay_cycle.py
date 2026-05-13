from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PayCycleCreateRequest(BaseModel):
    name: str
    ministry: str


class PayCycleResponse(BaseModel):
    id: str
    name: str
    ministry: str
    status: str
    started_at: datetime | None
    closed_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

