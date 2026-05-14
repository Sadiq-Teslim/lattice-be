from decimal import Decimal

from app.db.models import Worker
from app.services.identity import SquadIdentityVerifier, normalize_dob


class FakeSquad:
    def __init__(self) -> None:
        self.payload = None

    def create_virtual_account(self, **payload):
        self.payload = payload
        return {
            "success": True,
            "data": {"virtual_account_number": "1234567890"},
        }


def test_squad_identity_verifier_uses_virtual_account_flow(db_session) -> None:
    worker = Worker(
        worker_code="OG-MOE-001",
        full_name="Teslim Adetola Sadiq",
        bvn="12345678901",
        phone="08012345678",
        email="teslim@example.com",
        date_of_birth="1990-02-03",
        gender="1",
        address="Abeokuta, Ogun State",
        ministry="Ogun State Ministry of Education",
        salary_amount=Decimal("185000"),
        bank_account_number="0123456789",
    )
    db_session.add(worker)
    db_session.commit()

    squad = FakeSquad()
    evidence = SquadIdentityVerifier(db_session, squad=squad).verify_worker_bvn(worker)

    assert evidence is not None
    assert evidence["status"] == "BVN_MATCH"
    assert evidence["provider"] == "SQUAD"
    assert evidence["provider_reference"] == "1234567890"
    assert squad.payload["dob"] == "02/03/1990"
    assert squad.payload["beneficiary_account"] == "0123456789"
    assert worker.virtual_account_number == "1234567890"


def test_squad_identity_verifier_skips_when_required_identity_fields_are_missing(
    db_session,
) -> None:
    worker = Worker(
        worker_code="OG-MOE-002",
        full_name="Adebayo Ogunleye",
        bvn="12345678902",
        phone="08012345679",
        ministry="Ogun State Ministry of Education",
        salary_amount=Decimal("142000"),
    )
    db_session.add(worker)
    db_session.commit()

    evidence = SquadIdentityVerifier(db_session, squad=FakeSquad()).verify_worker_bvn(worker)

    assert evidence is None


def test_normalize_dob_accepts_supported_formats() -> None:
    assert normalize_dob("1990-02-03") == "02/03/1990"
    assert normalize_dob("02/03/1990") == "02/03/1990"
