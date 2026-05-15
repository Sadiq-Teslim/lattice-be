from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import numpy as np
import pandas as pd

FIRST_NAMES = [
    "Adebayo",
    "Chidinma",
    "Temitope",
    "Oluwaseun",
    "Fatima",
    "Ifeoma",
    "Tunde",
    "Aminu",
    "Kemi",
    "Nnamdi",
    "Zainab",
    "Chukwudi",
]

LAST_NAMES = [
    "Adeleke",
    "Okafor",
    "Balogun",
    "Eze",
    "Abubakar",
    "Ogunleye",
    "Okonkwo",
    "Ibrahim",
    "Adeyemi",
    "Nwosu",
    "Sani",
    "Bello",
]

DEPARTMENTS = [
    "Primary Education",
    "Secondary Education",
    "Payroll",
    "Field Operations",
    "Teacher Development",
    "Inspection",
]


@dataclass(frozen=True)
class SyntheticPayrollConfig:
    count: int = 1000
    ghost_count: int = 50
    seed: int = 42
    ministry: str = "Lagos State Ministry of Education"
    batch_id: str | None = None


def generate_synthetic_payroll(config: SyntheticPayrollConfig) -> pd.DataFrame:
    if config.count < 1:
        raise ValueError("count must be greater than zero")
    if config.ghost_count < 0:
        raise ValueError("ghost_count cannot be negative")
    if config.ghost_count >= config.count:
        raise ValueError("ghost_count must be lower than count")

    rng = np.random.default_rng(config.seed)
    batch_id = config.batch_id or uuid4().hex[:8].upper()
    normal_count = config.count - config.ghost_count
    base_time = datetime(2026, 5, 1, 8, 0, 0)

    records = []
    for index in range(normal_count):
        records.append(
            _normal_worker_record(
                rng=rng,
                index=index,
                batch_id=batch_id,
                ministry=config.ministry,
                base_time=base_time,
            )
        )

    ghost_cluster_size = 10
    ghost_clusters = max(1, int(np.ceil(config.ghost_count / ghost_cluster_size)))
    for ghost_index in range(config.ghost_count):
        cluster = ghost_index % ghost_clusters
        index = normal_count + ghost_index
        records.append(
            _ghost_worker_record(
                rng=rng,
                index=index,
                ghost_index=ghost_index,
                cluster=cluster,
                batch_id=batch_id,
                ministry=config.ministry,
                base_time=base_time,
            )
        )

    return pd.DataFrame(records)


def inject_verified_ogun_records(
    frame: pd.DataFrame,
    *,
    batch_id: str,
    ministry: str,
    teslim_bvn: str | None = None,
    teslim_bank_code: str | None = None,
    teslim_account_number: str | None = None,
    teslim_phone: str | None = None,
    teslim_email: str | None = None,
    teslim_dob: str | None = None,
) -> pd.DataFrame:
    records = frame.to_dict(orient="records")
    verified_records = _verified_ogun_records(
        batch_id=batch_id,
        ministry=ministry,
        teslim_bvn=teslim_bvn,
        teslim_bank_code=teslim_bank_code,
        teslim_account_number=teslim_account_number,
        teslim_phone=teslim_phone,
        teslim_email=teslim_email,
        teslim_dob=teslim_dob,
    )
    for index, record in enumerate(verified_records):
        if index < len(records):
            records[index] = record
        else:
            records.append(record)
    return pd.DataFrame(records)


def _verified_ogun_records(
    *,
    batch_id: str,
    ministry: str,
    teslim_bvn: str | None,
    teslim_bank_code: str | None,
    teslim_account_number: str | None,
    teslim_phone: str | None,
    teslim_email: str | None,
    teslim_dob: str | None,
) -> list[dict]:
    base_time = datetime(2026, 5, 1, 8, 0, 0)
    records = [
        _verified_worker_record(
            worker_code=_ogun_staff_id(0),
            full_name="Teslim Adetola Sadiq",
            bvn=teslim_bvn,
            phone=teslim_phone,
            email=teslim_email,
            date_of_birth=teslim_dob,
            gender="1",
            address="Ogun State Ministry of Education staff file",
            ministry=ministry,
            department="Teacher Development",
            salary_amount=Decimal("185000"),
            bank_code=teslim_bank_code,
            bank_account_number=teslim_account_number,
            bank_account_name="Teslim Adetola Sadiq",
            device_id=f"verified-device-{batch_id.lower()}-teslim",
            gps_lat=Decimal("7.1475"),
            gps_lng=Decimal("3.3619"),
            registration_ip="10.44.12.21",
            registration_timestamp=base_time + timedelta(minutes=15),
        ),
        _verified_worker_record(
            worker_code=_ogun_staff_id(1),
            full_name="Adebayo Ogunleye",
            bvn="22800000002",
            phone="08030000002",
            email="adebayo.ogunleye@ogunstate.gov.ng",
            date_of_birth="1985-04-12",
            gender="1",
            address="Abeokuta South, Ogun State",
            ministry=ministry,
            department="Secondary Education",
            salary_amount=Decimal("142500"),
            bank_code=None,
            bank_account_number=None,
            bank_account_name=None,
            device_id=f"verified-device-{batch_id.lower()}-adebayo",
            gps_lat=Decimal("7.1557"),
            gps_lng=Decimal("3.3451"),
            registration_ip="10.44.18.34",
            registration_timestamp=base_time + timedelta(minutes=45),
            verification_case="fail",
        ),
        _verified_worker_record(
            worker_code=_ogun_staff_id(2),
            full_name="Kemi Adeyemi",
            bvn="22800000003",
            phone="08030000003",
            email="kemi.adeyemi@ogunstate.gov.ng",
            date_of_birth="1988-11-03",
            gender="2",
            address="Ijebu Ode, Ogun State",
            ministry=ministry,
            department="Primary Education",
            salary_amount=Decimal("128000"),
            bank_code=None,
            bank_account_number=None,
            bank_account_name=None,
            device_id=f"verified-device-{batch_id.lower()}-kemi",
            gps_lat=Decimal("6.8194"),
            gps_lng=Decimal("3.9173"),
            registration_ip="10.44.21.19",
            registration_timestamp=base_time + timedelta(minutes=72),
        ),
    ]
    return [record for record in records if record["bvn"] and record["phone"]]


def _verified_worker_record(
    *,
    worker_code: str,
    full_name: str,
    bvn: str | None,
    phone: str | None,
    email: str | None,
    date_of_birth: str | None,
    gender: str,
    address: str,
    ministry: str,
    department: str,
    salary_amount: Decimal,
    bank_code: str | None,
    bank_account_number: str | None,
    bank_account_name: str | None,
    device_id: str,
    gps_lat: Decimal,
    gps_lng: Decimal,
    registration_ip: str,
    registration_timestamp: datetime,
    verification_case: str = "pass",
) -> dict:
    appointment_date = "2014-09-15"
    preverified_evidence = _preverified_evidence(verification_case)
    document_profile = _document_profile(
        worker_code=worker_code,
        bvn=bvn,
        date_of_birth=date_of_birth,
        appointment_date=appointment_date,
        verification_case=verification_case,
    )
    return {
        "worker_code": worker_code,
        "full_name": full_name,
        "bvn": bvn,
        "phone": phone,
        "email": email,
        "date_of_birth": date_of_birth,
        "gender": gender,
        "address": address,
        "ministry": ministry,
        "department": department,
        "salary_amount": salary_amount,
        "bank_code": bank_code,
        "bank_account_number": bank_account_number,
        "bank_account_name": bank_account_name,
        "device_id": device_id,
        "gps_lat": gps_lat,
        "gps_lng": gps_lng,
        "registration_ip": registration_ip,
        "registration_timestamp": registration_timestamp,
        "virtual_account_number": None,
        "risk_metadata": {
            "source": "seeded_ogun_staff_file",
            "demo_verifiable": True,
            "demo_verification_case": verification_case,
            "is_injected_ghost": False,
            "ghost_cluster": None,
            "preverified_evidence": preverified_evidence,
            "document_profile": document_profile,
        },
    }


def _preverified_evidence(verification_case: str) -> dict:
    if verification_case == "fail":
        return {
            "liveness": {
                "status": "FAILED",
                "confidence": 0.18,
                "attempts": 3,
                "challenge": "blink_twice_turn_left",
            },
            "deepfake": {
                "status": "DEEPFAKE_DETECTED",
                "synthetic_probability": 0.94,
                "model_name": "model-backed-inference",
            },
            "face_match": {"status": "FACE_MISMATCH", "similarity": 0.41},
            "bvn": {
                "status": "BVN_MISMATCH",
                "provider": "SQUAD",
                "provider_reference": "seeded-failure-case",
                "resolved_name": "Identity mismatch detected",
            },
        }
    return {
        "liveness": {
            "status": "PASSED",
            "confidence": 0.97,
            "attempts": 1,
            "challenge": "blink_twice_turn_left",
        },
        "deepfake": {
            "status": "CLEAN",
            "synthetic_probability": 0.01,
            "model_name": "model-backed-inference",
        },
        "face_match": {"status": "MATCH", "similarity": 0.98},
        "bvn": {
            "status": "BVN_MATCH",
            "provider": "SQUAD",
            "provider_reference": "seeded-verified-case",
        },
    }


def _document_profile(
    *,
    worker_code: str,
    bvn: str | None,
    date_of_birth: str | None,
    appointment_date: str,
    verification_case: str,
) -> dict:
    clean_profile = {
        "payroll_dob": date_of_birth,
        "bvn_dob": date_of_birth,
        "file_dob": date_of_birth,
        "appointment_date": appointment_date,
        "first_salary_date": "2014-10-25",
        "confirmation_date": "2016-09-15",
        "last_promotion_date": "2023-01-01",
        "retirement_date": "2050-12-31",
        "document_numbers": {
            "appointment_letter": f"OG/MOE/{worker_code[-5:]}",
            "bvn": bvn,
            "staff_id": worker_code,
        },
        "required_documents": [
            "appointment_letter",
            "birth_certificate",
            "promotion_letter",
            "staff_id_card",
        ],
        "submitted_documents": [
            "appointment_letter",
            "birth_certificate",
            "promotion_letter",
            "staff_id_card",
        ],
    }
    if verification_case != "fail":
        return clean_profile
    return {
        **clean_profile,
        "bvn_dob": "1980-01-01",
        "file_dob": "1992-09-22",
        "appointment_date": "2016-09-15",
        "first_salary_date": "2014-10-25",
        "confirmation_date": "2015-05-01",
        "document_numbers": {
            **clean_profile["document_numbers"],
            "appointment_letter": "DUPLICATE-OGUN-RECORD",
            "staff_id": "UNMATCHED-ID-CARD",
        },
        "submitted_documents": ["appointment_letter"],
    }


def _normal_worker_record(
    *,
    rng: np.random.Generator,
    index: int,
    batch_id: str,
    ministry: str,
    base_time: datetime,
) -> dict:
    first_name = str(rng.choice(FIRST_NAMES))
    last_name = str(rng.choice(LAST_NAMES))
    registration_offset = int(rng.integers(0, 21 * 24 * 60))

    return {
        "worker_code": _ogun_staff_id(index),
        "full_name": f"{first_name} {last_name}",
        "bvn": _digits(rng, 11),
        "phone": f"080{_digits(rng, 8)}",
        "email": f"worker{index + 1}@example.gov.ng",
        "date_of_birth": "07/19/1990",
        "gender": str(int(rng.integers(1, 3))),
        "address": "Demo civil service address, Lagos",
        "ministry": ministry,
        "department": str(rng.choice(DEPARTMENTS)),
        "salary_amount": Decimal(str(int(rng.integers(65000, 180000)))),
        "bank_code": None,
        "bank_account_number": None,
        "bank_account_name": None,
        "device_id": f"android-{batch_id.lower()}-{uuid4().hex[:10]}",
        "gps_lat": Decimal(str(round(6.45 + float(rng.normal(0, 0.08)), 7))),
        "gps_lng": Decimal(str(round(3.39 + float(rng.normal(0, 0.08)), 7))),
        "registration_ip": (
            f"10.{int(rng.integers(1, 200))}."
            f"{int(rng.integers(1, 255))}.{int(rng.integers(1, 255))}"
        ),
        "registration_timestamp": base_time + timedelta(minutes=registration_offset),
        "virtual_account_number": None,
        "risk_metadata": {
            "source": "synthetic_payroll",
            "is_injected_ghost": False,
            "ghost_cluster": None,
        },
    }


def _ghost_worker_record(
    *,
    rng: np.random.Generator,
    index: int,
    ghost_index: int,
    cluster: int,
    batch_id: str,
    ministry: str,
    base_time: datetime,
) -> dict:
    first_name = str(rng.choice(FIRST_NAMES))
    last_name = str(rng.choice(LAST_NAMES))
    cluster_lat = Decimal(str(round(6.5244 + (cluster * 0.001), 7)))
    cluster_lng = Decimal(str(round(3.3792 + (cluster * 0.001), 7)))
    burst_time = base_time + timedelta(days=25, minutes=cluster)

    return {
        "worker_code": _ogun_staff_id(index),
        "full_name": f"{first_name} {last_name}",
        "bvn": f"22{cluster:02d}0000000",
        "phone": f"081{cluster:02d}{ghost_index:05d}"[:11],
        "email": f"ghost{ghost_index + 1}@example.gov.ng",
        "date_of_birth": "07/19/1990",
        "gender": str(int(rng.integers(1, 3))),
        "address": "Injected ghost cluster address, Lagos",
        "ministry": ministry,
        "department": str(rng.choice(DEPARTMENTS)),
        "salary_amount": Decimal(str(int(rng.integers(90000, 175000)))),
        "bank_code": None,
        "bank_account_number": None,
        "bank_account_name": None,
        "device_id": f"shared-device-{batch_id.lower()}-{cluster:02d}",
        "gps_lat": cluster_lat,
        "gps_lng": cluster_lng,
        "registration_ip": f"172.16.{cluster}.10",
        "registration_timestamp": burst_time,
        "virtual_account_number": None,
        "risk_metadata": {
            "source": "synthetic_payroll",
            "is_injected_ghost": True,
            "ghost_cluster": cluster,
        },
    }


def _digits(rng: np.random.Generator, length: int) -> str:
    return "".join(str(int(value)) for value in rng.integers(0, 10, size=length))


def _ogun_staff_id(index: int) -> str:
    return f"OG{index + 1:05d}"
