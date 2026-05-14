from dataclasses import asdict
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ai.anomaly import PayrollAnomalyDetector, evaluate_anomaly_results
from app.ai.synthetic_data import (
    SyntheticPayrollConfig,
    generate_synthetic_payroll,
    inject_verified_ogun_records,
)
from app.core.config import settings
from app.db.models import PayCycle, Worker
from app.db.session import get_db
from app.schemas.demo import (
    AnomalyResultItem,
    AnomalyScanResponse,
    AnomalySummary,
    DemoSeedRequest,
    DemoSeedResponse,
)

router = APIRouter(prefix="/demo", tags=["demo"])
db_session = Depends(get_db)


@router.post("/seed", response_model=DemoSeedResponse, status_code=status.HTTP_201_CREATED)
def seed_demo_payroll(payload: DemoSeedRequest, db: Session = db_session) -> DemoSeedResponse:
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
        teslim_phone=settings.demo_teslim_phone,
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
