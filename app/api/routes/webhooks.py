import json

from fastapi import APIRouter, Depends, Header, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.squad import SquadWebhookAck
from app.services.billing import BillingService
from app.services.squad import (
    SquadAPIError,
    SquadConfigurationError,
    SquadService,
    squad_error_to_http,
)
from app.services.webhooks import SquadWebhookService, extract_transaction_reference

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
db_session = Depends(get_db)


@router.post("/squad", response_model=SquadWebhookAck)
async def receive_squad_webhook(
    request: Request,
    x_squad_encrypted_body: str | None = Header(default=None),
    x_squad_signature: str | None = Header(default=None),
    db: Session = db_session,
) -> JSONResponse:
    raw_body = await request.body()
    signature = x_squad_encrypted_body or x_squad_signature

    try:
        squad = SquadService()
        signature_is_valid = squad.verify_webhook_signature(
            raw_body=raw_body,
            header_signature=signature,
        )
    except (SquadConfigurationError, SquadAPIError) as exc:
        raise squad_error_to_http(exc) from exc

    if not signature_is_valid:
        return _ack(
            status_code=status.HTTP_400_BAD_REQUEST,
            transaction_reference=None,
            description="Invalid Squad webhook signature",
        )

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        return _ack(
            status_code=status.HTTP_400_BAD_REQUEST,
            transaction_reference=None,
            description="Invalid JSON payload",
        )

    transaction_reference = extract_transaction_reference(payload)
    if not transaction_reference:
        return _ack(
            status_code=status.HTTP_400_BAD_REQUEST,
            transaction_reference=None,
            description="Missing transaction_reference",
        )

    purchase = BillingService(db).apply_squad_webhook(payload)
    if purchase is not None:
        return _ack(
            status_code=status.HTTP_200_OK,
            transaction_reference=str(transaction_reference),
            description="Credit purchase applied",
        )

    viq = SquadWebhookService(db).apply_event(payload)
    if viq is None:
        return _ack(
            status_code=status.HTTP_400_BAD_REQUEST,
            transaction_reference=str(transaction_reference),
            description="Transaction reference not found",
        )

    return _ack(
        status_code=status.HTTP_200_OK,
        transaction_reference=str(transaction_reference),
        description="Success",
    )


def _ack(
    *,
    status_code: int,
    transaction_reference: str | None,
    description: str,
) -> JSONResponse:
    response_code = 200 if status_code == status.HTTP_200_OK else 400
    return JSONResponse(
        status_code=status_code,
        content={
            "response_code": response_code,
            "transaction_reference": transaction_reference,
            "response_description": description,
        },
    )
