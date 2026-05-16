from dataclasses import asdict
from datetime import datetime
from decimal import Decimal
from math import sqrt
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ai.anomaly import PayrollAnomalyDetector, evaluate_anomaly_results
from app.ai.synthetic_data import (
    SyntheticPayrollConfig,
    _document_profile,
    _preverified_evidence,
    generate_synthetic_payroll,
    inject_verified_ogun_records,
)
from app.core.config import settings
from app.db.models import PayCycle, StaffAction, VerificationExercise, VIQ, Worker
from app.db.session import get_db
from app.schemas.demo import (
    AnomalyResultItem,
    AnomalyScanResponse,
    AnomalySummary,
    DemoBootstrapResponse,
    DemoSeedRequest,
    DemoSeedResponse,
)

router = APIRouter(prefix="/demo", tags=["demo"])
db_session = Depends(get_db)
DEMO_TESLIM_PHONE = "07063569494"


@router.post("/seed", response_model=DemoSeedResponse, status_code=status.HTTP_201_CREATED)
def seed_demo_payroll(payload: DemoSeedRequest, db: Session = db_session) -> DemoSeedResponse:
    return _create_demo_batch(payload, db)


@router.get("/ogun-bootstrap", response_model=DemoBootstrapResponse)
def bootstrap_ogun_demo(db: Session = db_session) -> DemoBootstrapResponse:
    pay_cycle = (
        db.query(PayCycle)
        .filter(PayCycle.ministry.like("Ogun State Ministry of Education Demo%"))
        .order_by(PayCycle.created_at.desc())
        .first()
    )
    if pay_cycle is None:
        seed = _create_demo_batch(
            DemoSeedRequest(
                count=100,
                ghost_count=5,
                seed=42,
                ministry="Ogun State Ministry of Education",
            ),
            db,
        )
        pay_cycle = db.get(PayCycle, seed.pay_cycle_id)
        if pay_cycle is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="demo bootstrap failed")

    workers = (
        db.query(Worker)
        .filter(Worker.ministry == pay_cycle.ministry)
        .order_by(Worker.created_at.desc())
        .limit(1000)
        .all()
    )
    if not workers:
        seed = _create_demo_batch(
            DemoSeedRequest(
                count=100,
                ghost_count=5,
                seed=42,
                ministry="Ogun State Ministry of Education",
            ),
            db,
        )
        pay_cycle = db.get(PayCycle, seed.pay_cycle_id)
        if pay_cycle is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="demo bootstrap failed")
        workers = (
            db.query(Worker)
            .filter(Worker.ministry == pay_cycle.ministry)
            .order_by(Worker.created_at.desc())
            .limit(1000)
            .all()
        )
    else:
        _normalize_ogun_worker_codes(db, workers)
        _ensure_ogun_demo_verification_cases(db, workers)
        seed = DemoSeedResponse(
            pay_cycle_id=pay_cycle.id,
            ministry=pay_cycle.ministry,
            workers_inserted=len(workers),
            injected_ghost_workers=sum(1 for worker in workers if worker.risk_metadata.get("is_injected_ghost")),
        )

    _normalize_ogun_worker_codes(db, workers)
    _ensure_ogun_demo_verification_cases(db, workers)
    _reset_click_to_verify_demo_results(db, pay_cycle=pay_cycle, workers=workers)
    viqs = (
        db.query(VIQ)
        .filter(VIQ.pay_cycle_id == pay_cycle.id)
        .order_by(VIQ.created_at.desc())
        .limit(1000)
        .all()
    )
    staff_actions = (
        db.query(StaffAction)
        .filter(StaffAction.pay_cycle_id == pay_cycle.id)
        .order_by(StaffAction.created_at.desc())
        .limit(1000)
        .all()
    )
    exercises = (
        db.query(VerificationExercise)
        .filter(VerificationExercise.ministry == pay_cycle.ministry)
        .order_by(VerificationExercise.created_at.desc())
        .limit(100)
        .all()
    )
    return DemoBootstrapResponse(
        seed=seed,
        pay_cycle=pay_cycle,
        workers=workers,
        viqs=viqs,
        staff_actions=staff_actions,
        exercises=exercises,
        summary=_build_demo_summary(
            ministry=pay_cycle.ministry,
            pay_cycle_id=pay_cycle.id,
            workers=workers,
            viqs=viqs,
            actions=staff_actions,
        ),
    )


def _normalize_ogun_worker_codes(db: Session, workers: list[Worker]) -> None:
    if not workers or all(_is_ogun_staff_id(worker.worker_code) for worker in workers):
        return

    ordered_workers = sorted(workers, key=_ogun_code_sort_key)
    for worker in ordered_workers:
        worker.worker_code = f"TMP-{worker.id}"
    db.flush()
    for index, worker in enumerate(ordered_workers, start=1):
        worker.worker_code = f"OG{index:05d}"
    db.commit()


def _is_ogun_staff_id(value: str) -> bool:
    return len(value) == 7 and value.startswith("OG") and value[2:].isdigit()


def _ogun_code_sort_key(worker: Worker) -> tuple[int, str, str]:
    metadata = worker.risk_metadata or {}
    if worker.full_name == "Teslim Adetola Sadiq":
        rank = 0
    elif metadata.get("demo_verifiable") is True:
        rank = 1
    elif metadata.get("is_injected_ghost") is True:
        rank = 3
    else:
        rank = 2
    return (rank, worker.created_at.isoformat() if worker.created_at else "", worker.id)


def _ensure_ogun_demo_verification_cases(db: Session, workers: list[Worker]) -> None:
    worker_by_code = {worker.worker_code: worker for worker in workers}
    changed = False

    for worker in workers:
        if not isinstance(worker.biometric_template, dict):
            _assign_demo_biometric_template(worker)
            changed = True

    teslim = worker_by_code.get("OG00001")
    if teslim is not None:
        _apply_pass_case(teslim)
        changed = True

    failing_worker = worker_by_code.get("OG00002")
    if failing_worker is not None:
        _apply_fail_case(failing_worker)
        changed = True

    if changed:
        db.commit()


def _reset_click_to_verify_demo_results(
    db: Session,
    *,
    pay_cycle: PayCycle,
    workers: list[Worker],
) -> None:
    demo_worker_ids = [
        worker.id
        for worker in workers
        if worker.worker_code in {"OG00001", "OG00002"}
        and (worker.risk_metadata or {}).get("demo_verification_case") in {"pass", "fail"}
    ]
    if not demo_worker_ids:
        return

    db.query(StaffAction).filter(
        StaffAction.pay_cycle_id == pay_cycle.id,
        StaffAction.worker_id.in_(demo_worker_ids),
    ).delete(synchronize_session=False)
    db.query(VIQ).filter(
        VIQ.pay_cycle_id == pay_cycle.id,
        VIQ.worker_id.in_(demo_worker_ids),
    ).delete(synchronize_session=False)
    db.commit()


def _apply_pass_case(worker: Worker) -> None:
    worker.full_name = "Teslim Adetola Sadiq"
    worker.bvn = settings.demo_teslim_bvn or worker.bvn
    worker.phone = DEMO_TESLIM_PHONE
    worker.email = settings.demo_teslim_email or worker.email
    worker.date_of_birth = settings.demo_teslim_dob or worker.date_of_birth
    worker.gender = worker.gender or "1"
    worker.address = "Ogun State Ministry of Education staff file"
    worker.department = "Teacher Development"
    worker.salary_amount = Decimal("185000")
    worker.bank_code = settings.demo_teslim_bank_code or worker.bank_code
    worker.bank_account_number = settings.demo_teslim_account_number or worker.bank_account_number
    worker.bank_account_name = "Teslim Adetola Sadiq"
    worker.risk_metadata = {
        **(worker.risk_metadata or {}),
        "source": "seeded_ogun_staff_file",
        "demo_verifiable": True,
        "demo_verification_case": "pass",
        "is_injected_ghost": False,
        "ghost_cluster": None,
        "preverified_evidence": _preverified_evidence("pass"),
        "document_profile": _document_profile(
            worker_code=worker.worker_code,
            bvn=worker.bvn,
            date_of_birth=str(worker.date_of_birth) if worker.date_of_birth else None,
            appointment_date="2014-09-15",
            verification_case="pass",
        ),
    }
    _assign_demo_biometric_template(worker)


def _apply_fail_case(worker: Worker) -> None:
    worker.full_name = "Adebayo Ogunleye"
    worker.bvn = worker.bvn or "22800000002"
    worker.phone = worker.phone or "08030000002"
    worker.email = worker.email or "adebayo.ogunleye@ogunstate.gov.ng"
    worker.date_of_birth = "1985-04-12"
    worker.gender = worker.gender or "1"
    worker.address = "Abeokuta South, Ogun State"
    worker.department = "Secondary Education"
    worker.salary_amount = Decimal("142500")
    worker.bank_code = None
    worker.bank_account_number = None
    worker.bank_account_name = None
    worker.risk_metadata = {
        **(worker.risk_metadata or {}),
        "source": "seeded_ogun_staff_file",
        "demo_verifiable": True,
        "demo_verification_case": "fail",
        "is_injected_ghost": False,
        "ghost_cluster": None,
        "preverified_evidence": _preverified_evidence("fail"),
        "document_profile": _document_profile(
            worker_code=worker.worker_code,
            bvn=worker.bvn,
            date_of_birth=str(worker.date_of_birth) if worker.date_of_birth else None,
            appointment_date="2014-09-15",
            verification_case="fail",
        ),
    }
    _assign_demo_biometric_template(worker)


def _assign_demo_biometric_template(worker: Worker) -> None:
    vector = _demo_biometric_vector(
        worker_code=worker.worker_code,
        full_name=worker.full_name,
        date_of_birth=str(worker.date_of_birth) if worker.date_of_birth else "",
    )
    worker.biometric_template = {
        "modality": "fingerprint",
        "vector": vector,
        "provider": "lattice-demo-enrollment",
        "captured_at": "2026-05-15T00:00:00Z",
        "metadata": {
            "source": "seeded_ogun_staff_file",
            "worker_code": worker.worker_code,
        },
        "quality": _demo_biometric_quality(vector),
    }


def _demo_biometric_vector(*, worker_code: str, full_name: str, date_of_birth: str) -> list[float]:
    seed = f"{worker_code.strip().upper()}|{full_name.strip().lower()}|{date_of_birth.strip()}"
    state = 2166136261
    for character in seed:
        state ^= ord(character)
        state = (state * 16777619) % (2**32)
    values: list[float] = []
    for index in range(16):
        state ^= index + 0x9E3779B9
        state = (state * 16777619) % (2**32)
        values.append(round(((state % 2000) - 1000) / 1000, 6))
    return values


def _demo_biometric_quality(vector: list[float]) -> dict:
    magnitude = sqrt(sum(value * value for value in vector))
    zero_ratio = sum(1 for value in vector if abs(value) < 1e-9) / len(vector)
    return {
        "dimension": len(vector),
        "magnitude": round(magnitude, 6),
        "zero_ratio": round(zero_ratio, 6),
        "usable": magnitude > 0.01 and zero_ratio < 0.95,
    }


def _create_demo_batch(payload: DemoSeedRequest, db: Session) -> DemoSeedResponse:
    if payload.ghost_count >= payload.count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ghost_count must be lower than count",
        )

    batch_id = uuid4().hex[:8].upper()
    ministry = f"{payload.ministry} Demo {batch_id}"
    config = SyntheticPayrollConfig(
        count=payload.count,
        ghost_count=payload.ghost_count,
        seed=payload.seed,
        ministry=ministry,
        batch_id=batch_id,
    )
    frame = generate_synthetic_payroll(config)
    frame = inject_verified_ogun_records(
        frame,
        batch_id=batch_id,
        ministry=ministry,
        teslim_bvn=settings.demo_teslim_bvn,
        teslim_bank_code=settings.demo_teslim_bank_code,
        teslim_account_number=settings.demo_teslim_account_number,
        teslim_phone=DEMO_TESLIM_PHONE,
        teslim_email=settings.demo_teslim_email,
        teslim_dob=settings.demo_teslim_dob,
    )

    pay_cycle = PayCycle(
        name=f"May 2026 Payroll Demo {batch_id}",
        ministry=ministry,
        status="DRAFT",
    )
    db.add(pay_cycle)
    db.flush()

    workers = [Worker(**record) for record in frame.to_dict(orient="records")]
    db.add_all(workers)
    db.commit()

    return DemoSeedResponse(
        pay_cycle_id=pay_cycle.id,
        ministry=ministry,
        workers_inserted=len(workers),
        injected_ghost_workers=payload.ghost_count,
    )


def _build_demo_summary(
    *,
    ministry: str,
    pay_cycle_id: str,
    workers: list[Worker],
    viqs: list[VIQ],
    actions: list[StaffAction],
):
    approved_ids = {
        action.worker_id for action in actions if action.action_type == "APPROVE_PAYMENT"
    }
    flagged_ids = {
        action.worker_id for action in actions if action.action_type == "FLAG_INVESTIGATION"
    }
    viq_by_worker = {viq.worker_id: viq for viq in viqs}
    gross = sum((Decimal(worker.salary_amount) for worker in workers), Decimal("0"))
    eligible = sum(
        (
            Decimal(worker.salary_amount)
            for worker in workers
            if worker.id in approved_ids
            or (viq_by_worker.get(worker.id) and viq_by_worker[worker.id].verdict == "PASS")
        ),
        Decimal("0"),
    )
    held = gross - eligible
    from app.schemas.admin import AdminSummaryResponse

    return AdminSummaryResponse(
        ministry=ministry,
        pay_cycle_id=pay_cycle_id,
        workers=len(workers),
        viqs=len(viqs),
        pass_count=sum(1 for viq in viqs if viq.verdict == "PASS"),
        review_count=sum(1 for viq in viqs if viq.verdict == "REVIEW"),
        fail_count=sum(1 for viq in viqs if viq.verdict == "FAIL"),
        approved_count=len(approved_ids),
        flagged_count=len(flagged_ids),
        held_count=sum(
            1
            for worker in workers
            if worker.id in flagged_ids
            or (viq_by_worker.get(worker.id) and viq_by_worker[worker.id].verdict != "PASS")
        ),
        gross_payroll=str(gross),
        eligible_payroll=str(eligible),
        held_payroll=str(held),
    )


@router.get("/anomalies", response_model=AnomalyScanResponse)
def scan_demo_anomalies(
    pay_cycle_id: str = Query(...),
    contamination: float = Query(default=0.05, gt=0, lt=0.5),
    db: Session = db_session,
) -> AnomalyScanResponse:
    pay_cycle = db.get(PayCycle, pay_cycle_id)
    if pay_cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pay cycle not found")

    workers = db.query(Worker).filter(Worker.ministry == pay_cycle.ministry).all()
    if not workers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="no workers found for pay cycle ministry",
        )

    records = [_worker_to_anomaly_record(worker) for worker in workers]
    detector = PayrollAnomalyDetector(contamination=contamination)
    scan_results = detector.scan(records)
    ghost_lookup = {
        worker.worker_code: bool(worker.risk_metadata.get("is_injected_ghost"))
        for worker in workers
    }

    response_items = [
        AnomalyResultItem(
            worker_code=result.worker_code,
            anomaly_score=result.anomaly_score,
            flagged=result.flagged,
            explanations=result.explanations,
            feature_contributions=[
                asdict(contribution) for contribution in result.feature_contributions
            ],
            explanation_method=result.explanation_method,
            is_injected_ghost=ghost_lookup.get(result.worker_code),
        )
        for result in scan_results
    ]

    injected_ghost_workers = sum(1 for value in ghost_lookup.values() if value)
    injected_ghosts_flagged = sum(
        1
        for item in response_items
        if item.flagged and item.is_injected_ghost
    )
    recall = (
        round(injected_ghosts_flagged / injected_ghost_workers, 4)
        if injected_ghost_workers
        else None
    )
    metrics = evaluate_anomaly_results(
        results=scan_results,
        injected_ghost_lookup=ghost_lookup,
    )

    return AnomalyScanResponse(
        pay_cycle_id=pay_cycle_id,
        summary=AnomalySummary(
            scanned_workers=len(response_items),
            flagged_workers=sum(1 for item in response_items if item.flagged),
            injected_ghost_workers=injected_ghost_workers,
            injected_ghosts_flagged=injected_ghosts_flagged,
            recall_on_injected_ghosts=recall,
            true_positives=metrics.true_positives,
            false_positives=metrics.false_positives,
            true_negatives=metrics.true_negatives,
            false_negatives=metrics.false_negatives,
            precision=metrics.precision,
            recall=metrics.recall,
            f1_score=metrics.f1_score,
            false_positive_rate=metrics.false_positive_rate,
        ),
        results=response_items,
    )


def _worker_to_anomaly_record(worker: Worker) -> dict:
    return {
        "worker_code": worker.worker_code,
        "device_id": worker.device_id,
        "gps_lat": worker.gps_lat,
        "gps_lng": worker.gps_lng,
        "registration_ip": worker.registration_ip,
        "registration_timestamp": worker.registration_timestamp or datetime.utcnow(),
        "bvn": worker.bvn,
    }
