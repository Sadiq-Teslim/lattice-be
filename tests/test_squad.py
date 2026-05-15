import hashlib
import hmac

import pytest

from app.core.config import settings
from app.services.squad import SquadConfigurationError, SquadService
from app.services.webhooks import extract_transaction_reference


def test_squad_service_requires_secret_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "squad_secret_key", "")

    with pytest.raises(SquadConfigurationError):
        SquadService()


def test_squad_webhook_signature_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "test-secret"
    raw_body = b'{"transaction_reference":"SBS_TEST_123","transaction_status":"SUCCESS"}'
    signature = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest().upper()
    monkeypatch.setattr(settings, "squad_secret_key", secret)
    monkeypatch.setattr(settings, "squad_webhook_secret", None)

    service = SquadService()

    assert service.verify_webhook_signature(
        raw_body=raw_body,
        header_signature=signature,
    )
    assert not service.verify_webhook_signature(
        raw_body=raw_body,
        header_signature="bad-signature",
    )


def test_squad_transfer_reference_requires_merchant_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "squad_secret_key", "test-secret")
    monkeypatch.setattr(settings, "squad_merchant_id", None)
    service = SquadService()

    with pytest.raises(SquadConfigurationError):
        service._merchant_scoped_reference("LTA-123")


def test_squad_sms_uses_instant_messages_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}
    monkeypatch.setattr(settings, "squad_secret_key", "test-secret")
    monkeypatch.setattr(settings, "squad_sms_endpoint", "/sms/send/instant")
    monkeypatch.setattr(settings, "squad_sms_sender_id", "Lattice")

    def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = kwargs["json"]
        return {"success": True}

    service = SquadService()
    monkeypatch.setattr(service, "_request", fake_request)

    response = service.send_sms(phone="08012345678", message="OTP 123456")

    assert response == {"success": True}
    assert captured == {
        "method": "POST",
        "path": "/sms/send/instant",
        "json": {
            "sender_id": "Lattice",
            "messages": [{"phone_number": "08012345678", "message": "OTP 123456"}],
        },
    }


def test_squad_initiate_payment_uses_checkout_channels(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}
    monkeypatch.setattr(settings, "squad_secret_key", "test-secret")

    def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = kwargs["json"]
        return {"success": True}

    service = SquadService()
    monkeypatch.setattr(service, "_request", fake_request)

    response = service.initiate_payment(
        email="billing@example.com",
        amount_naira=5000,
        customer_name="Ogun Ministry",
        transaction_ref="LTC-123",
        callback_url="https://example.com/callback",
    )

    assert response == {"success": True}
    assert captured["method"] == "POST"
    assert captured["path"] == "/transaction/initiate"
    assert captured["json"]["amount"] == 500000
    assert captured["json"]["payment_channels"] == ["card", "bank", "ussd", "transfer"]


def test_webhook_reference_extraction_supports_documented_shape() -> None:
    payload = {
        "Event": "charge_successful",
        "TransactionRef": "SQTECH6389179925109400004",
        "Body": {
            "transaction_ref": "SQTECH6389179925109400004",
            "transaction_status": "Success",
        },
    }

    assert extract_transaction_reference(payload) == "SQTECH6389179925109400004"
