import hashlib
import hmac
import json
from typing import Any


def canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def sign_payload(payload: dict[str, Any], secret: str) -> str:
    message = canonical_json(payload).encode("utf-8")
    key = secret.encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def verify_payload_signature(payload: dict[str, Any], signature: str, secret: str) -> bool:
    expected = sign_payload(payload, secret)
    return hmac.compare_digest(expected, signature)

