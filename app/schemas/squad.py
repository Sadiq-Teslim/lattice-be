from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


class SquadResponse(BaseModel):
    response: dict[str, Any]


class AccountLookupRequest(BaseModel):
    bank_code: str = Field(min_length=6, max_length=6)
    account_number: str = Field(min_length=10, max_length=10)


class CreateWorkerVirtualAccountRequest(BaseModel):
    worker_id: str
    dob: str | None = Field(default=None, description="MM/DD/YYYY")
    gender: Literal["1", "2"] | None = None
    address: str | None = None
    email: str | None = None
    beneficiary_account: str = Field(min_length=10, max_length=10)


class InitiateVIQTransferRequest(BaseModel):
    viq_id: str
    bank_code: str | None = Field(default=None, min_length=6, max_length=6)
    account_number: str | None = Field(default=None, min_length=10, max_length=10)
    account_name: str | None = None
    amount_naira: Decimal | None = Field(default=None, gt=0)
    remark: str | None = None


class InitiateVIQTransferResponse(BaseModel):
    viq_id: str
    transaction_reference: str
    payment_status: str
    squad_response: dict[str, Any]


class SquadWebhookAck(BaseModel):
    response_code: int
    transaction_reference: str | None = None
    response_description: str
