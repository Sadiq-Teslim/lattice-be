import pytest
from fastapi import HTTPException

from app.core.auth import require_lattice_api_key
from app.core.config import settings
from app.core.security import sign_payload, verify_payload_signature


def test_payload_signature_round_trip() -> None:
    payload = {"worker_id": "EDU-001", "trust_score": 94, "flags": []}
    signature = sign_payload(payload, "test-secret-for-signing")

    assert verify_payload_signature(payload, signature, "test-secret-for-signing") is True


def test_payload_signature_detects_tampering() -> None:
    payload = {"worker_id": "EDU-001", "trust_score": 94, "flags": []}
    signature = sign_payload(payload, "test-secret-for-signing")

    tampered = {**payload, "trust_score": 40}

    assert verify_payload_signature(tampered, signature, "test-secret-for-signing") is False


def test_optional_lattice_api_key_allows_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "lattice_api_key", None)

    assert require_lattice_api_key() is None


def test_optional_lattice_api_key_rejects_bad_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "lattice_api_key", "demo-key")

    with pytest.raises(HTTPException) as exc:
        require_lattice_api_key("wrong")

    assert exc.value.status_code == 401


def test_optional_lattice_api_key_accepts_good_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "lattice_api_key", "demo-key")

    assert require_lattice_api_key("demo-key") is None
