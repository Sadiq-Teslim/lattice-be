from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.models import PayCycle
from app.db.session import get_db
from app.schemas.pay_cycle import PayCycleCreateRequest, PayCycleResponse

router = APIRouter(prefix="/pay-cycles", tags=["pay-cycles"])
db_session = Depends(get_db)


@router.post("", response_model=PayCycleResponse, status_code=status.HTTP_201_CREATED)
def create_pay_cycle(payload: PayCycleCreateRequest, db: Session = db_session) -> PayCycleResponse:
    pay_cycle = PayCycle(name=payload.name, ministry=payload.ministry, status="DRAFT")
    db.add(pay_cycle)
    db.commit()
    db.refresh(pay_cycle)
    return pay_cycle


@router.get("", response_model=list[PayCycleResponse])
def list_pay_cycles(
    ministry: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = db_session,
) -> list[PayCycleResponse]:
    query = db.query(PayCycle).order_by(PayCycle.created_at.desc())
    if ministry:
        query = query.filter(PayCycle.ministry == ministry)
    return query.offset(offset).limit(limit).all()


@router.get("/{pay_cycle_id}", response_model=PayCycleResponse)
def get_pay_cycle(pay_cycle_id: str, db: Session = db_session) -> PayCycleResponse:
    pay_cycle = db.get(PayCycle, pay_cycle_id)
    if pay_cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pay cycle not found")
    return pay_cycle


@router.post("/{pay_cycle_id}/start", response_model=PayCycleResponse)
def start_pay_cycle(pay_cycle_id: str, db: Session = db_session) -> PayCycleResponse:
    pay_cycle = db.get(PayCycle, pay_cycle_id)
    if pay_cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pay cycle not found")
    pay_cycle.status = "ACTIVE"
    pay_cycle.started_at = datetime.utcnow()
    db.commit()
    db.refresh(pay_cycle)
    return pay_cycle


@router.post("/{pay_cycle_id}/close", response_model=PayCycleResponse)
def close_pay_cycle(pay_cycle_id: str, db: Session = db_session) -> PayCycleResponse:
    pay_cycle = db.get(PayCycle, pay_cycle_id)
    if pay_cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pay cycle not found")
    pay_cycle.status = "CLOSED"
    pay_cycle.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(pay_cycle)
    return pay_cycle

