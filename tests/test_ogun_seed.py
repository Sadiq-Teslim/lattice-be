from app.ai.synthetic_data import (
    SyntheticPayrollConfig,
    generate_synthetic_payroll,
    inject_verified_ogun_records,
)
from app.core.scoring import VerificationSignals, compute_trust_score


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
        teslim_phone="08030000001",
        teslim_dob="1998-01-01",
    )

    assert frame["worker_code"].str.match(r"^OG\d{5}$").all()
    assert frame["worker_code"].is_unique

    teslim = frame.iloc[0]
    failing_worker = frame.iloc[1]

    assert teslim["worker_code"] == "OG00001"
    assert teslim["full_name"] == "Teslim Adetola Sadiq"
    assert teslim["bank_code"] == "000014"
    assert teslim["bank_account_number"] == "1914399138"
    assert _score_for(teslim, document_status="DOCUMENTS_CLEAN").verdict == "PASS"

    fail_score = _score_for(failing_worker, document_status="DOCUMENT_INCONSISTENCY")
    assert failing_worker["worker_code"] == "OG00002"
    assert fail_score.verdict == "FAIL"
    assert "LIVENESS_FAIL" in fail_score.flags
    assert "DEEPFAKE_DETECTED" in fail_score.flags
    assert "BVN_MISMATCH" in fail_score.flags


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
