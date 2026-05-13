import base64

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives.hashes import SHA256


def verify_p256_signature(
    *,
    payload_hash: str,
    signature: str | None,
    public_jwk: dict | None,
) -> bool:
    if not signature or not public_jwk:
        return False
    try:
        x = int.from_bytes(_b64url_decode(public_jwk["x"]), "big")
        y = int.from_bytes(_b64url_decode(public_jwk["y"]), "big")
        raw_signature = _b64url_decode(signature)
        if len(raw_signature) != 64:
            return False
        r = int.from_bytes(raw_signature[:32], "big")
        s = int.from_bytes(raw_signature[32:], "big")
        der_signature = utils.encode_dss_signature(r, s)
        public_numbers = ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1())
        public_key = public_numbers.public_key()
        public_key.verify(der_signature, payload_hash.encode("utf-8"), ec.ECDSA(SHA256()))
    except (KeyError, ValueError, InvalidSignature):
        return False
    return True


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))
