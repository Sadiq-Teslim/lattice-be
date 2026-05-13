from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_lattice_api_key
from app.db.session import get_db
from app.schemas.jobs import EnqueueJobResponse, EnqueueSDKVerificationRequest, JobResponse
from app.services.jobs import JobService, process_job_in_background

router = APIRouter(
    prefix="/jobs",
    tags=["jobs"],
    dependencies=[Depends(require_lattice_api_key)],
)
db_session = Depends(get_db)


@router.post("/sdk-verification", response_model=EnqueueJobResponse, status_code=202)
def enqueue_sdk_verification(
    payload: EnqueueSDKVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = db_session,
) -> EnqueueJobResponse:
    job = JobService(db).enqueue_sdk_verification(payload.request)
    background_tasks.add_task(process_job_in_background, job.id)
    return EnqueueJobResponse(job_id=job.id, status=job.status)


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, db: Session = db_session) -> JobResponse:
    return JobResponse.model_validate(JobService(db).get_job(job_id), from_attributes=True)
