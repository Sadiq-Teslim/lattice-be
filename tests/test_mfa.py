from app.db.models import Worker
from app.services.otp import OTPService


class FakeSmsSender:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    def send_sms(self, *, phone: str, message: str, sender_id: str | None = None) -> dict:
        self.messages.append({"phone": phone, "message": message, "sender_id": sender_id})
        return {"success": True, "message_id": "sms_test_1"}


def test_otp_send_hashes_code_and_records_provider_response(db_session) -> None:
    worker = Worker(
        worker_code="MFA-001",
        full_name="Adebayo Adeyemi",
        bvn="12345678901",
        phone="08012345678",
        ministry="Ogun State Ministry of Education",
        salary_amount=100000,
    )
    db_session.add(worker)
    db_session.commit()

    sender = FakeSmsSender()
    challenge = OTPService(db_session, sms_sender=sender).send_worker_otp(worker_id=worker.id)

    assert challenge.status == "PENDING"
    assert challenge.provider_response == {"success": True, "message_id": "sms_test_1"}
    assert sender.messages[0]["phone"] == "08012345678"
    assert sender.messages[0]["message"].count("Lattice verification OTP") == 1
    assert "08012345678" not in challenge.otp_hash
