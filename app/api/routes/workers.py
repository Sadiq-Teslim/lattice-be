from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.models import Worker
from app.db.session import get_db
from app.schemas.worker import WorkerCreateRequest, WorkerResponse

router = APIRouter(prefix="/workers", tags=["workers"])
db_session = Depends(get_db)


@router.post("", response_model=WorkerResponse, status_code=status.HTTP_201_CREATED)
def create_worker(payload: WorkerCreateRequest, db: Session = db_session) -> WorkerResponse:
    existing = db.query(Worker).filter(Worker.worker_code == payload.worker_code).one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="worker_code already exists",
        )
    worker = Worker(**payload.model_dump())
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return worker


@router.get("", response_model=list[WorkerResponse])
def list_workers(
    ministry: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = db_session,
) -> list[WorkerResponse]:
    query = db.query(Worker).order_by(Worker.created_at.desc())
    if ministry:
        query = query.filter(Worker.ministry == ministry)
    return query.offset(offset).limit(limit).all()


@router.get("/{worker_id}", response_model=WorkerResponse)
def get_worker(worker_id: str, db: Session = db_session) -> WorkerResponse:
    worker = db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="worker not found")
    return worker

