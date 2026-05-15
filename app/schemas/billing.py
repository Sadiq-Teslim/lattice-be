from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class BillingAccountResponse(BaseModel):
    id: str
    name: str
    email: str | None
    api_key_last4: str
    credit_balance: int
    status: str
    price_per_credit_naira: int


class CreditPurchaseCreateRequest(BaseModel):
    credits: int = Field(ge=10, le=100_000)
    customer_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=3, max_length=255)


class CreditPurchaseResponse(BaseModel):
    id: str
    account_id: str
    credits: int
    amount_naira: Decimal
    transaction_reference: str
    checkout_url: str | None
    status: str
    created_at: datetime
    paid_at: datetime | None = None


class CreditLedgerEntryResponse(BaseModel):
    id: str
    delta: int
    balance_after: int
    reason: str
    reference: str | None
    created_at: datetime
