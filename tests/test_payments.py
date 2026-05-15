from app.db.models import PayCycle, VIQ, Worker
from app.services.payments import PaymentService
from app.services.squad import SquadService


def test_requery_viq_transfer_updates_paid_status(monkeypatch, db_session) -> None:
    worker = Worker(
        worker_code="PAY-001",
        full_name="Adebayo Adeyemi",
        bvn="12345678901",
        phone="08012345678",
        ministry="Ogun State Ministry of Education",
        salary_amount=100000,
    )
    pay_cycle = PayCycle(name="May Payroll", ministry=worker.ministry)
    db_session.add_all([worker, pay_cycle])
    db_session.commit()

    viq = VIQ(
        worker_id=worker.id,
        pay_cycle_id=pay_cycle.id,
        session_id="session-1",
        trust_score=94,
        verdict="PASS",
        flags=[],
        signed_payload={"payment_status": "TRANSFER_INITIATED"},
        signature="signature",
        squad_transaction_reference="SBG2LNMMCL_LTA_123",
        payment_status="TRANSFER_INITIATED",
    )
    db_session.add(viq)
    db_session.commit()

    def fake_requery(self, transaction_reference: str):
        assert transaction_reference == "SBG2LNMMCL_LTA_123"
        return {"data": {"transaction_status": "SUCCESS"}}

    monkeypatch.setattr(SquadService, "requery_transfer", fake_requery)

    updated_viq, response = PaymentService(db_session).requery_viq_transfer(viq_id=viq.id)

    assert response == {"data": {"transaction_status": "SUCCESS"}}
    assert updated_viq.payment_status == "PAID_AND_VERIFIED"
    assert updated_viq.signed_payload["payment_status"] == "PAID_AND_VERIFIED"
