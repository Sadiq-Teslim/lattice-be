import hmac

from fastapi import Header, HTTPException, status

from app.core.config import settings


def require_lattice_api_key(x_lattice_api_key: str | None = Header(default=None)) -> None:
    if not settings.lattice_api_key:
        return
    if x_lattice_api_key and hmac.compare_digest(x_lattice_api_key, settings.lattice_api_key):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="valid X-Lattice-API-Key header is required",
    )
