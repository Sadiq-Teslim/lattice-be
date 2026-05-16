from decimal import Decimal

from app.ai.synthetic_data import (
    SyntheticPayrollConfig,
    generate_synthetic_payroll,
    inject_verified_ogun_records,
)
from app.api.routes.demo import _apply_pass_case, _reset_click_to_verify_demo_results
from app.core.scoring import VerificationSignals, compute_trust_score
from app.db.models import PayCycle, StaffAction, VerificationSession, VIQ, Worker


def test_ogun_seed_has_pass_and_fail_demo_records() -> None:
    frame = generate_synthetic_payroll(
        SyntheticPayrollConfig(
            count=30,
            ghost_count=5,
            seed=42,
            ministry="Ogun State Ministry of Education",
            batch_id="TESTBATCH",
        )
    )
    frame = inject_verified_ogun_records(
        frame,
        batch_id="TESTBATCH",
        ministry="Ogun State Ministry of Education",
        teslim_bvn="22811452171",
        teslim_bank_code="000014",
        teslim_account_number="1914399138",
        teslim_phone="07063569494",
        teslim_dob="1998-01-01",
    )

    assert frame["worker_code"].str.match(r"^OG\d{5}$").all()
    assert frame["worker_code"].is_unique

    teslim = frame.iloc[0]
    failing_worker = frame.iloc[1]

    assert teslim["worker_code"] == "OG00001"
    assert teslim["full_name"] == "Teslim Adetola Sadiq"
    assert teslim["phone"] == "07063569494"
    assert teslim["bank_code"] == "000014"
    assert teslim["bank_account_number"] == "1914399138"
    assert _score_for(teslim, document_status="DOCUMENTS_CLEAN").verdict == "PASS"

    fail_score = _score_for(failing_worker, document_status="DOCUMENT_INCONSISTENCY")
    assert failing_worker["worker_code"] == "OG00002"
    assert fail_score.verdict == "FAIL"
    assert "LIVENESS_FAIL" in fail_score.flags
    assert "DEEPFAKE_DETECTED" in fail_score.flags
    assert "BVN_MISMATCH" in fail_score.flags


def test_click_to_verify_demo_results_are_reset_on_bootstrap(db_session) -> None:
    pay_cycle = PayCycle(
        name="May 2026 Payroll Demo TEST",
        ministry="Ogun State Ministry of Education Demo TEST",
    )
    teslim = _worker("OG00001", "Teslim Adetola Sadiq", "pass", pay_cycle.ministry)
    failing_worker = _worker("OG00002", "Adebayo Ogunleye", "fail", pay_cycle.ministry)
    other_worker = _worker("OG00003", "Kemi Adeyemi", "pass", pay_cycle.ministry)
    db_session.add_all([pay_cycle, teslim, failing_worker, other_worker])
    db_session.flush()

    reset_viqs = [
        _viq(teslim, pay_cycle, "PASS"),
        _viq(failing_worker, pay_cycle, "FAIL"),
    ]
    kept_viq = _viq(other_worker, pay_cycle, "PASS")
    db_session.add_all(reset_viqs + [kept_viq])
    db_session.flush()
    db_session.add_all(
        [
            StaffAction(
                worker_id=teslim.id,
                pay_cycle_id=pay_cycle.id,
                viq_id=reset_viqs[0].id,
                action_type="APPROVE_PAYMENT",
                status="RECORDED",
            ),
            StaffAction(
                worker_id=other_worker.id,
                pay_cycle_id=pay_cycle.id,
                viq_id=kept_viq.id,
                action_type="APPROVE_PAYMENT",
                status="RECORDED",
            ),
        ]
    )
    db_session.commit()

    _reset_click_to_verify_demo_results(
        db_session,
        pay_cycle=pay_cycle,
        workers=[teslim, failing_worker, other_worker],
    )

    assert db_session.query(VIQ).filter(VIQ.worker_id.in_([teslim.id, failing_worker.id])).count() == 0
    assert db_session.query(VIQ).filter(VIQ.worker_id == other_worker.id).count() == 1
    assert db_session.query(StaffAction).filter(StaffAction.worker_id == teslim.id).count() == 0
    assert db_session.query(StaffAction).filter(StaffAction.worker_id == other_worker.id).count() == 1


def test_demo_teslim_phone_is_fixed_for_bootstrap_case() -> None:
    worker = _worker("OG00001", "Old Name", "pass", "Ogun State Ministry of Education Demo TEST")
    worker.phone = "08000000000"

    _apply_pass_case(worker)

    assert worker.full_name == "Teslim Adetola Sadiq"
    assert worker.phone == "07063569494"


def _score_for(row, *, document_status: str):
    evidence = row["risk_metadata"]["preverified_evidence"]
    return compute_trust_score(
        VerificationSignals(
            liveness_status=evidence["liveness"]["status"],
            liveness_attempts=evidence["liveness"]["attempts"],
            deepfake_status=evidence["deepfake"]["status"],
            face_match_status=evidence["face_match"]["status"],
            bvn_status=evidence["bvn"]["status"],
            document_status=document_status,
        )
    )


def _worker(worker_code: str, full_name: str, verification_case: str, ministry: str) -> Worker:
    return Worker(
        worker_code=worker_code,
        full_name=full_name,
        bvn=f"22800{worker_code[-5:]}",
        phone=f"08030{worker_code[-5:]}",
        ministry=ministry,
        salary_amount=Decimal("100000"),
        risk_metadata={
            "demo_verification_case": verification_case,
            "demo_verifiable": True,
        },
    )


def _viq(worker: Worker, pay_cycle: PayCycle, verdict: str) -> VIQ:
    session = VerificationSession(
        worker_id=worker.id,
        pay_cycle_id=pay_cycle.id,
        session_token=f"token-{worker.worker_code}",
    )
    return VIQ(
        worker_id=worker.id,
        pay_cycle_id=pay_cycle.id,
        session=session,
        trust_score=100 if verdict == "PASS" else 20,
        verdict=verdict,
        flags=[] if verdict == "PASS" else ["LIVENESS_FAIL"],
        signed_payload={"worker_id": worker.id, "verdict": verdict},
        signature=f"test-{worker.worker_code}",
    )
