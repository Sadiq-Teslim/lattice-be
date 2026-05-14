from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Worker
from app.db.session import get_db
from app.schemas.squad import (
    AccountLookupRequest,
    CreateWorkerVirtualAccountRequest,
    InitiateVIQTransferRequest,
    InitiateVIQTransferResponse,
    SquadResponse,
)
from app.services.identity import normalize_dob, split_name
from app.services.payments import PaymentService
from app.services.squad import (
    SquadAPIError,
    SquadConfigurationError,
    SquadService,
    squad_error_to_http,
)

router = APIRouter(prefix="/squad", tags=["squad"])
db_session = Depends(get_db)


@router.post("/account-lookup", response_model=SquadResponse)
def account_lookup(payload: AccountLookupRequest) -> SquadResponse:
    try:
        response = SquadService().account_lookup(
            bank_code=payload.bank_code,
            account_number=payload.account_number,
        )
    except (SquadConfigurationError, SquadAPIError) as exc:
        raise squad_error_to_http(exc) from exc
    return SquadResponse(response=response)


@router.post("/virtual-accounts/workers", response_model=SquadResponse)
def create_worker_virtual_account(
    payload: CreateWorkerVirtualAccountRequest,
    db: Session = db_session,
) -> SquadResponse:
    worker = db.get(Worker, payload.worker_id)
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="worker not found")

    try:
        first_name, last_name, middle_name = split_name(worker.full_name)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    email = payload.email or worker.email
    dob = payload.dob or worker.date_of_birth
    gender = payload.gender or worker.gender
    address = payload.address or worker.address
    missing = [
        name
        for name, value in {
            "email": email,
            "dob": dob,
            "gender": gender,
            "address": address,
        }.items()
        if not value
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"missing required virtual-account fields: {', '.join(missing)}",
        )

    try:
        response = SquadService().create_virtual_account(
            customer_identifier=worker.worker_code,
            first_name=first_name,
            last_name=last_name,
            middle_name=middle_name,
            mobile_num=worker.phone,
            email=str(email),
            bvn=worker.bvn,
            dob=normalize_dob(str(dob)),
            gender=str(gender),
            address=str(address),
            beneficiary_account=payload.beneficiary_account,
        )
    except (SquadConfigurationError, SquadAPIError) as exc:
        raise squad_error_to_http(exc) from exc

    virtual_account_number = response.get("data", {}).get("virtual_account_number")
    if virtual_account_number:
        worker.virtual_account_number = str(virtual_account_number)
    worker.email = str(email)
    worker.date_of_birth = str(dob)
    worker.gender = str(gender)
    worker.address = str(address)
    db.add(
        AuditLog(
            worker_id=worker.id,
            pay_cycle_id=None,
            event_type="SQUAD_VIRTUAL_ACCOUNT_CREATED",
            payload={
                "worker_code": worker.worker_code,
                "virtual_account_number": virtual_account_number,
                "customer_identifier": worker.worker_code,
                "squad_response": response,
            },
        )
    )
    db.commit()
    return SquadResponse(response=response)


@router.post("/transfers/viq", response_model=InitiateVIQTransferResponse)
def initiate_viq_transfer(
    payload: InitiateVIQTransferRequest,
    db: Session = db_session,
) -> InitiateVIQTransferResponse:
    viq, squad_response = PaymentService(db).initiate_viq_transfer(
        viq_id=payload.viq_id,
        bank_code=payload.bank_code,
        account_number=payload.account_number,
        account_name=payload.account_name,
        amount_naira=payload.amount_naira,
        remark=payload.remark,
    )
    return InitiateVIQTransferResponse(
        viq_id=viq.id,
        transaction_reference=str(viq.squad_transaction_reference),
        payment_status=viq.payment_status,
        squad_response=squad_response,
    )
