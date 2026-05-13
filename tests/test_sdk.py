from app.db.models import PayCycle, Worker
from app.schemas.pay_cycle import PayCycleCreateRequest
from app.schemas.sdk import VerifyAndDisburseRequest
from app.schemas.verification import (
    BvnEvidence,
    DeepfakeEvidence,
    FaceMatchEvidence,
    LivenessEvidence,
    VerificationEvidenceSubmitRequest,
)
from app.services.sdk import SDKService


def test_sdk_verify_and_disburse_creates_pass_viq(db_session) -> None:
    worker = Worker(
        worker_code="SDK-001",
        full_name="Adebayo Adeyemi",
        bvn="12345678901",
        phone="08012345678",
        ministry="Ogun State Ministry of Education",
        salary_amount=100000,
        device_id="device-1",
        gps_lat=6.5,
        gps_lng=3.3,
        registration_ip="10.0.0.1",
    )
    db_session.add(worker)
    for index in range(25):
        db_session.add(
            Worker(
                worker_code=f"SDK-N-{index:03d}",
                full_name=f"Worker {index}",
                bvn=f"1234567{index:04d}"[-11:],
                phone=f"0800000{index:04d}"[-11:],
                ministry="Ogun State Ministry of Education",
                salary_amount=100000,
                device_id=f"device-{index + 2}",
                gps_lat=6.5 + index * 0.001,
                gps_lng=3.3 + index * 0.001,
                registration_ip=f"10.0.{index}.1",
            )
        )
    db_session.commit()

    payload = VerifyAndDisburseRequest(
        worker_id=worker.id,
        pay_cycle=PayCycleCreateRequest(
            name="SDK Test Cycle",
            ministry="Ogun State Ministry of Education",
        ),
        evidence=VerificationEvidenceSubmitRequest(
            liveness=LivenessEvidence(status="PASSED", confidence=0.96, attempts=1),
            deepfake=DeepfakeEvidence(status="CLEAN", synthetic_probability=0.02),
            face_match=FaceMatchEvidence(status="MATCH", similarity=0.98),
            bvn=BvnEvidence(status="BVN_MATCH", provider="SQUAD"),
        ),
    )

    result = SDKService(db_session).verify_and_disburse(payload)

    assert result["viq"].verdict == "PASS"
    assert result["payment_attempted"] is False
    assert result["worker"].id == worker.id
    assert isinstance(result["pay_cycle"], PayCycle)
