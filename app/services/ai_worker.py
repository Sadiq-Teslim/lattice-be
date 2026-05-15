from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


class AIWorkerUnavailable(RuntimeError):
    pass


def ai_worker_configured() -> bool:
    return bool(settings.ai_worker_url and settings.ai_worker_url.strip())


def ai_worker_endpoint(path: str) -> str:
    if not ai_worker_configured():
        raise AIWorkerUnavailable("AI_WORKER_URL is not configured")
    base_url = str(settings.ai_worker_url).rstrip("/")
    prefix = settings.api_v1_prefix.rstrip("/")
    return f"{base_url}{prefix}{path}"


async def ai_worker_get(path: str) -> dict[str, Any]:
    return await _request("GET", path)


async def ai_worker_post_files(path: str, files: list[tuple[str, tuple[str, bytes, str]]]) -> dict[str, Any]:
    return await _request("POST", path, files=files)


async def _request(
    method: str,
    path: str,
    *,
    files: list[tuple[str, tuple[str, bytes, str]]] | None = None,
) -> dict[str, Any]:
    headers = {}
    if settings.ai_worker_api_key:
        headers["X-Lattice-AI-Key"] = settings.ai_worker_api_key
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.request(method, ai_worker_endpoint(path), headers=headers, files=files)
    except AIWorkerUnavailable:
        raise
    except httpx.HTTPError as exc:
        raise AIWorkerUnavailable(f"AI worker request failed: {exc}") from exc

    if response.status_code >= 400:
        detail: Any
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI worker returned a non-JSON response",
        ) from exc
    return payload
