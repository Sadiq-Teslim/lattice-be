import json
import sys
from pathlib import Path

import httpx
import pytest

SDK_PATH = Path(__file__).resolve().parents[1] / "sdk" / "python"
sys.path.insert(0, str(SDK_PATH))

from lattice_sdk import LatticeAPIError, LatticeClient  # noqa: E402


def test_python_sdk_sends_verify_and_disburse_payload_and_api_key() -> None:
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["api_key"] = request.headers.get("X-Lattice-API-Key")
        captured["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "viq": {"verdict": "PASS", "trust_score": 100, "flags": []},
                "payment_attempted": False,
            },
        )

    client = LatticeClient(
        base_url="https://lattice.example/api/v1",
        api_key="demo-key",
        transport=httpx.MockTransport(handler),
    )

    response = client.verify_and_disburse(
        worker_id="worker-1",
        pay_cycle_id="cycle-1",
        evidence={
            "liveness": {"status": "PASSED", "confidence": 0.96, "attempts": 1},
            "deepfake": {"status": "CLEAN", "synthetic_probability": 0.02},
            "face_match": {"status": "MATCH", "similarity": 0.98},
            "bvn": {"status": "BVN_MATCH", "provider": "SQUAD"},
        },
    )

    assert response["viq"]["verdict"] == "PASS"
    assert captured["method"] == "POST"
    assert captured["url"] == "https://lattice.example/api/v1/sdk/verify-and-disburse"
    assert captured["api_key"] == "demo-key"
    assert captured["payload"]["worker_id"] == "worker-1"
    assert captured["payload"]["evidence"]["bvn"]["provider"] == "SQUAD"


def test_python_sdk_raises_api_error() -> None:
    client = LatticeClient(
        base_url="https://lattice.example/api/v1",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(401, json={"detail": "bad key"})
        ),
    )

    with pytest.raises(LatticeAPIError) as exc:
        client.health()

    assert exc.value.status_code == 401
    assert exc.value.detail == {"detail": "bad key"}
