from app.db.models import Worker
from app.schemas.sdk import VerifyAndDisburseRequest
from app.schemas.verification import (
    BvnEvidence,
    DeepfakeEvidence,
    FaceMatchEvidence,
    LivenessEvidence,
    VerificationEvidenceSubmitRequest,
)
from app.services.jobs import JobService


def test_sdk_verification_job_completes(db_session) -> None:
    worker = Worker(
        worker_code="JOB-001",
        full_name="Adebayo Adeyemi",
        bvn="12345678901",
        phone="08012345678",
        ministry="Ogun State Ministry of Education",
        salary_amount=100000,
        device_id="job-device-1",
        gps_lat=6.5,
        gps_lng=3.3,
        registration_ip="10.0.0.1",
    )
    db_session.add(worker)
    for index in range(25):
        db_session.add(
            Worker(
                worker_code=f"JOB-N-{index:03d}",
                full_name=f"Worker {index}",
                bvn=f"2345678{index:04d}"[-11:],
                phone=f"0801000{index:04d}"[-11:],
                ministry="Ogun State Ministry of Education",
                salary_amount=100000,
                device_id=f"job-device-{index + 2}",
                gps_lat=6.5 + index * 0.001,
                gps_lng=3.3 + index * 0.001,
                registration_ip=f"10.1.{index}.1",
            )
        )
    db_session.commit()

    request = VerifyAndDisburseRequest(
        worker_id=worker.id,
        evidence=VerificationEvidenceSubmitRequest(
            liveness=LivenessEvidence(status="PASSED", confidence=0.96, attempts=1),
            deepfake=DeepfakeEvidence(status="CLEAN", synthetic_probability=0.02),
            face_match=FaceMatchEvidence(status="MATCH", similarity=0.98),
            bvn=BvnEvidence(status="BVN_MATCH", provider="SQUAD"),
        ),
    )

    service = JobService(db_session)
    job = service.enqueue_sdk_verification(request)
    completed = service.process_job(job.id)

    assert completed.status == "COMPLETED"
    assert completed.result["viq"]["verdict"] == "PASS"
