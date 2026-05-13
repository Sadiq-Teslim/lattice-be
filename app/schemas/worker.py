from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkerCreateRequest(BaseModel):
    worker_code: str
    full_name: str
    bvn: str = Field(min_length=11, max_length=11)
    phone: str
    ministry: str
    salary_amount: Decimal = Field(gt=0)
    department: str | None = None
    email: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None
    address: str | None = None
    device_id: str | None = None
    gps_lat: Decimal | None = None
    gps_lng: Decimal | None = None
    registration_ip: str | None = None
    registration_timestamp: datetime | None = None
    bank_code: str | None = None
    bank_account_number: str | None = None
    bank_account_name: str | None = None
    risk_metadata: dict[str, Any] = Field(default_factory=dict)


class WorkerResponse(BaseModel):
    id: str
    worker_code: str
    full_name: str
    bvn: str
    phone: str
    email: str | None
    date_of_birth: str | None
    gender: str | None
    ministry: str
    department: str | None
    salary_amount: Decimal
    device_id: str | None
    gps_lat: Decimal | None
    gps_lng: Decimal | None
    registration_ip: str | None
    registration_timestamp: datetime | None
    virtual_account_number: str | None
    bank_code: str | None
    bank_account_number: str | None
    bank_account_name: str | None
    status: str
    risk_metadata: dict[str, Any]

    model_config = ConfigDict(from_attributes=True)

