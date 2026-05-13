# Lattice Python SDK

Integrate Lattice into an existing payroll system as a proof-of-life checkpoint before salary release.

## Install Locally

```powershell
pip install -e sdk/python
```

## Minimal Integration

```python
from lattice_sdk import LatticeClient

client = LatticeClient(base_url="http://127.0.0.1:8010/api/v1")

result = client.verify_and_disburse(
    worker_id="worker-id",
    pay_cycle_id="pay-cycle-id",
    evidence={
        "liveness": {"status": "PASSED", "confidence": 0.96, "attempts": 1},
        "deepfake": {"status": "CLEAN", "synthetic_probability": 0.02},
        "face_match": {"status": "MATCH", "similarity": 0.98},
        "bvn": {"status": "BVN_MATCH", "provider": "SQUAD"},
    },
    initiate_transfer=False,
)

viq = result["viq"]
if viq["verdict"] == "PASS":
    print("Release salary")
elif viq["verdict"] == "REVIEW":
    print("Send to HR review")
else:
    print("Block salary")
```

## Ogun Ministry Flow

```python
cycle = client.create_pay_cycle(
    name="2026 Annual Staff Verification",
    ministry="Ogun State Ministry of Education",
)

job = client.enqueue_verification(
    worker={
        "worker_code": "OG-MOE-04821",
        "full_name": "Adebayo Adeyemi",
        "bvn": "12345678901",
        "phone": "08012345678",
        "ministry": "Ogun State Ministry of Education",
        "salary_amount": 100000,
    },
    pay_cycle_id=cycle["id"],
    evidence={
        "liveness": {"status": "PASSED", "confidence": 0.96, "attempts": 1},
        "deepfake": {"status": "CLEAN", "synthetic_probability": 0.02},
        "face_match": {"status": "MATCH", "similarity": 0.98},
        "bvn": {"status": "BVN_MATCH", "provider": "SQUAD"},
    },
)
```

The payroll system only needs the VIQ verdict:

- `PASS`: release salary or allow Squad transfer
- `REVIEW`: hold for HR review
- `FAIL`: block salary and log the worker as absent/suspect
