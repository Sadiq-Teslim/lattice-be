import base64

from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives.hashes import SHA256

from app.core.offline_signature import verify_p256_signature


def test_verify_p256_signature_round_trip() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_numbers = private_key.public_key().public_numbers()
    payload_hash = "abc123"
    der_signature = private_key.sign(payload_hash.encode("utf-8"), ec.ECDSA(SHA256()))
    r, s = utils.decode_dss_signature(der_signature)
    raw_signature = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    public_jwk = {
        "kty": "EC",
        "crv": "P-256",
        "x": _b64url(public_numbers.x.to_bytes(32, "big")),
        "y": _b64url(public_numbers.y.to_bytes(32, "big")),
    }

    assert verify_p256_signature(
        payload_hash=payload_hash,
        signature=_b64url(raw_signature),
        public_jwk=public_jwk,
    )
    assert not verify_p256_signature(
        payload_hash="tampered",
        signature=_b64url(raw_signature),
        public_jwk=public_jwk,
    )


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")

