# Document Consistency Engine

This module supports the Ogun State annual staff verification use case.

Endpoint:

```text
POST /api/v1/ai/document-consistency/evaluate
```

It checks whether a staff member's records are internally consistent across payroll, BVN, staff file, appointment history, salary history, promotion history, retirement data, and submitted documents.

## Checks

- payroll DOB does not match BVN DOB
- staff file DOB does not match payroll DOB
- worker was underage at appointment
- worker was overage at appointment
- first salary date is before appointment date
- confirmation date is before appointment date
- promotion date is before appointment date
- retirement date implies unusual retirement age
- duplicate document numbers across a staff cohort
- missing required documents

## Output

```json
{
  "status": "DOCUMENT_INCONSISTENCY",
  "severity": "HIGH",
  "flags": [
    {
      "code": "DOB_MISMATCH",
      "severity": "HIGH",
      "message": "Payroll date of birth does not match BVN date of birth",
      "fields": ["payroll_dob", "bvn_dob"]
    }
  ],
  "summary": "1 issue(s): 1 high, 0 medium, 0 low"
}
```

## Verification Scoring

The verification orchestrator accepts document evidence:

```json
{
  "documents": {
    "status": "DOCUMENT_INCONSISTENCY",
    "severity": "HIGH",
    "flags": [],
    "summary": "Document issues found"
  }
}
```

`DOCUMENT_INCONSISTENCY` deducts 20 points from the Trust Score.

This should usually route a worker to `REVIEW`, not automatic punishment, unless other hard flags are also present.
