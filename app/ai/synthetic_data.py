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
        "worker_code": f"EDU-{batch_id}-{index + 1:05d}",
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
        "worker_code": f"EDU-{batch_id}-G{ghost_index + 1:04d}",
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
