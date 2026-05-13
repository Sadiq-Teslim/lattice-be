from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.models import VIQ
from app.db.session import get_db
from app.schemas.verification import VIQResponse

router = APIRouter(prefix="/viq", tags=["viq"])
db_session = Depends(get_db)


@router.get("", response_model=list[VIQResponse])
def list_viqs(
    worker_id: str | None = Query(default=None),
    pay_cycle_id: str | None = Query(default=None),
    verdict: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = db_session,
) -> list[VIQResponse]:
    query = db.query(VIQ).order_by(VIQ.created_at.desc())
    if worker_id:
        query = query.filter(VIQ.worker_id == worker_id)
    if pay_cycle_id:
        query = query.filter(VIQ.pay_cycle_id == pay_cycle_id)
    if verdict:
        query = query.filter(VIQ.verdict == verdict.upper())
    return query.offset(offset).limit(limit).all()


@router.get("/{viq_id}", response_model=VIQResponse)
def get_viq(viq_id: str, db: Session = db_session) -> VIQResponse:
    viq = db.get(VIQ, viq_id)
    if viq is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VIQ not found")
    return viq
