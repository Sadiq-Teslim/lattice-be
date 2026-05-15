import hashlib
import hmac
import json
from decimal import Decimal
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


class SquadConfigurationError(RuntimeError):
    pass


class SquadAPIError(RuntimeError):
    def __init__(self, *, status_code: int, message: str, response: dict[str, Any] | None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class SquadService:
    def __init__(self, timeout: float = 30.0) -> None:
        self.base_url = settings.squad_base_url.rstrip("/")
        self.secret_key = _required("SQUAD_SECRET_KEY", settings.squad_secret_key)
        self.public_key = _clean(settings.squad_public_key)
        self.merchant_id = _clean(settings.squad_merchant_id)
        self.webhook_secret = _clean(settings.squad_webhook_secret) or self.secret_key
        self.timeout = timeout

    def create_virtual_account(
        self,
        *,
        customer_identifier: str,
        first_name: str,
        last_name: str,
        mobile_num: str,
        email: str,
        bvn: str,
        dob: str,
        gender: str,
        address: str,
        beneficiary_account: str,
        middle_name: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "customer_identifier": customer_identifier,
            "first_name": first_name,
            "last_name": last_name,
            "middle_name": middle_name or "",
            "mobile_num": mobile_num,
            "email": email,
            "bvn": bvn,
            "dob": dob,
            "address": address,
            "gender": gender,
            "beneficiary_account": beneficiary_account,
        }
        return self._request("POST", "/virtual-account", json=payload)

    def get_virtual_account_by_customer_identifier(
        self,
        *,
        customer_identifier: str,
    ) -> dict[str, Any]:
        return self._request("GET", f"/virtual-account/{customer_identifier}")

    def account_lookup(self, *, bank_code: str, account_number: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/payout/account/lookup",
            json={"bank_code": bank_code, "account_number": account_number},
        )

    def initiate_transfer(
        self,
        *,
        amount_naira: Decimal,
        bank_code: str,
        account_number: str,
        account_name: str,
        transaction_reference: str,
        remark: str,
    ) -> dict[str, Any]:
        payload = {
            "remark": remark,
            "bank_code": bank_code,
            "currency_id": "NGN",
            "amount": str(int(amount_naira * 100)),
            "account_number": account_number,
            "transaction_reference": self._merchant_scoped_reference(transaction_reference),
            "account_name": account_name,
        }
        return self._request("POST", "/payout/transfer", json=payload)

    def requery_transfer(self, *, transaction_reference: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/payout/requery",
            json={"transaction_reference": self._merchant_scoped_reference(transaction_reference)},
        )

    def send_sms(self, *, phone: str, message: str, sender_id: str | None = None) -> dict[str, Any]:
        payload = {
            "sender_id": sender_id or settings.squad_sms_sender_id,
            "messages": [
                {
                    "phone_number": phone,
                    "message": message,
                }
            ],
        }
        return self._request("POST", settings.squad_sms_endpoint, json=payload)

    def initiate_payment(
        self,
        *,
        email: str,
        amount_naira: Decimal,
        customer_name: str,
        transaction_ref: str,
        callback_url: str,
        payment_channels: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = {
            "email": email,
            "amount": int(amount_naira * 100),
            "currency": "NGN",
            "customer_name": customer_name,
            "initiate_type": "inline",
            "transaction_ref": transaction_ref,
            "callback_url": callback_url,
            "payment_channels": payment_channels or ["card", "bank", "ussd", "transfer"],
            "metadata": metadata or {},
        }
        return self._request("POST", "/transaction/initiate", json=payload)

    def verify_webhook_signature(self, *, raw_body: bytes, header_signature: str | None) -> bool:
        if not header_signature:
            return False
        digest = hmac.new(self.webhook_secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(digest.upper(), header_signature.upper())

    def _merchant_scoped_reference(self, reference: str) -> str:
        merchant_id = _required("SQUAD_MERCHANT_ID", self.merchant_id)
        if reference.startswith(f"{merchant_id}_"):
            return reference
        return f"{merchant_id}_{reference}"

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.secret_key}"
        headers["Content-Type"] = "application/json"
        url = f"{self.base_url}{path}"

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.request(method, url, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise SquadAPIError(
                status_code=status.HTTP_502_BAD_GATEWAY,
                message=f"Squad request failed: {exc.__class__.__name__}",
                response=None,
            ) from exc

        response_payload = _response_json(response)
        if response.status_code >= 400 or response_payload.get("success") is False:
            raise SquadAPIError(
                status_code=response.status_code,
                message=str(response_payload.get("message") or "Squad API request failed"),
                response=response_payload,
            )
        return response_payload


def squad_error_to_http(exc: SquadConfigurationError | SquadAPIError) -> HTTPException:
    if isinstance(exc, SquadConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={"message": str(exc), "squad_response": exc.response},
    )


def _required(name: str, value: str | None) -> str:
    if value is None or not value.strip():
        raise SquadConfigurationError(f"{name} is required for real Squad integration")
    return value.strip()


def _clean(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    return value.strip()


def _response_json(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except json.JSONDecodeError:
        return {
            "success": False,
            "message": "Squad returned a non-JSON response",
            "data": response.text,
        }
    if isinstance(payload, dict):
        return payload
    return {
        "success": False,
        "message": "Squad returned an unexpected response shape",
        "data": payload,
    }
