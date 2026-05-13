from typing import Any


class LatticeError(Exception):
    """Base error for Lattice SDK failures."""


class LatticeConnectionError(LatticeError):
    """Raised when the SDK cannot reach the Lattice API."""


class LatticeAPIError(LatticeError):
    """Raised when the Lattice API returns a non-success response."""

    def __init__(self, *, status_code: int, detail: Any, response_text: str) -> None:
        super().__init__(f"Lattice API returned {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail
        self.response_text = response_text
