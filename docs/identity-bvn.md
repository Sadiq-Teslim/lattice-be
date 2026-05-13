# Identity And BVN Handling

The original PRD mentioned a standalone Squad BVN verification endpoint. The public Squad docs currently available do not expose that endpoint.

For this build, identity verification is handled through documented Squad B2C virtual account creation.

## Documented Squad Flow

Endpoint:

```text
POST /virtual-account
```

Required identity fields include:

- first name
- last name
- mobile number
- email
- BVN
- date of birth
- gender
- address
- beneficiary account

Squad validates BVN against the supplied identity information during this flow.

## Backend Evidence

The verification orchestrator accepts BVN evidence in this shape:

```json
{
  "bvn": {
    "status": "BVN_MATCH",
    "provider": "SQUAD",
    "provider_reference": "<squad-reference>",
    "resolved_name": "Legal Name",
    "matched_name": "Payroll Name"
  }
}
```

If BVN evidence is missing, the VIQ routes to `REVIEW`.

If BVN evidence is `BVN_MISMATCH`, the trust score receives a penalty and the worker may be routed to review or fail depending on other flags.

## Next Upgrade

If Squad provides a private or hackathon-only BVN verification endpoint, add it to `SquadService` and call it before VIQ finalization.

