# Squad Integration Notes

This project does not mock Squad. Real Squad calls require real sandbox credentials in local `.env`.

Do not commit keys.

## Environment

```env
SQUAD_BASE_URL=https://sandbox-api-d.squadco.com
SQUAD_SECRET_KEY=
SQUAD_PUBLIC_KEY=
SQUAD_WEBHOOK_SECRET=
SQUAD_MERCHANT_ID=
SQUAD_SMS_ENDPOINT=/sms/send/instant
SQUAD_SMS_SENDER_ID=Lattice
```

`SQUAD_SECRET_KEY` is required for all Squad API calls.

`SQUAD_MERCHANT_ID` is required for transfers because Squad requires transfer references to be prefixed with the merchant ID.

`SQUAD_WEBHOOK_SECRET` is optional; if omitted, the secret key is used for webhook HMAC validation.

`SQUAD_SMS_ENDPOINT` is configurable because Squad SMS access may vary by merchant/product
enablement. The default is the documented SMS instant-send endpoint shape used by this build.

## Implemented Endpoints

### Account Lookup

Squad endpoint:

```text
POST /payout/account/lookup
```

App endpoint:

```text
POST /api/v1/squad/account-lookup
```

Purpose:

Confirms the recipient account name before a transfer.

## Virtual Account Creation

Squad endpoint:

```text
POST /virtual-account
```

App endpoint:

```text
POST /api/v1/squad/virtual-accounts/workers
```

Purpose:

Creates a worker's Squad virtual account. Squad validates BVN against the supplied first name, last name, DOB, gender, and phone number during this flow.

## Salary Transfer

Squad endpoint:

```text
POST /payout/transfer
```

App endpoint:

```text
POST /api/v1/squad/transfers/viq
```

Purpose:

Initiates salary payment only for a VIQ with verdict `PASS`.

The app performs Squad account lookup before transfer. The VIQ is updated to `TRANSFER_INITIATED` with the Squad transaction reference.

## Webhook

Squad webhook endpoint to configure in the Squad dashboard:

```text
POST /api/v1/webhooks/squad
```

For local development, expose the API with a tunnel and configure:

```text
https://<your-tunnel>/api/v1/webhooks/squad
```

Dashboard path:

```text
Profile > API & Webhook
```

Squad signs webhook bodies with HMAC SHA512 in the `x-squad-encrypted-body` header. The app validates the signature before applying any event.

When a matching transaction reference is found, the VIQ payment status is updated and the VIQ payload is re-signed. The handler supports Squad's documented webhook shape with `TransactionRef` and nested `Body.transaction_ref`.

## SMS OTP

Squad endpoint:

```text
POST /sms/send/instant
```

Request shape used by the app:

```json
{
  "sender_id": "Lattice",
  "messages": [
    {
      "phone_number": "08012345678",
      "message": "Your Lattice verification OTP is 123456..."
    }
  ]
}
```

App endpoints:

```text
POST /api/v1/mfa/otp/send
POST /api/v1/mfa/otp/verify
```

Purpose:

Sends a six-digit verification OTP to the worker phone number stored on the payroll/BVN record. The
backend stores only an HMAC hash of the OTP with a short TTL. A challenge is persisted only after
Squad accepts the SMS request.

## Current Product Interpretation

The public Squad docs do not expose a standalone BVN verification endpoint. For this build, BVN identity validation is treated as part of Squad B2C virtual-account creation, because that documented flow validates BVN against identity fields.

## Current Smoke Test Result

`python scripts/squad_smoke.py` reached real Squad sandbox with the configured secret key.

Observed results:

- Missing virtual-account lookup returned `404` with `No virtual account is associated`.
- Account lookup reached Squad but returned `400` with `Merchant not eligible to use this endpoint`.

Interpretation:

- Authentication reaches Squad.
- Transfer/account-lookup product access still needs merchant eligibility/profiling from Squad.
