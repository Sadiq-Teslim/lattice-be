from decimal import Decimal

from app.core.config import settings
from app.schemas.billing import CreditPurchaseCreateRequest
from app.services.billing import BillingService
from app.services.squad import SquadService


def test_billing_account_starts_with_demo_credits(monkeypatch, db_session) -> None:
    monkeypatch.setattr(settings, "default_account_initial_credits", 25)

    account = BillingService(db_session).get_or_create_account_for_key("lt_test_1234")

    assert account.credit_balance == 25
    assert account.api_key == "lt_test_1234"


def test_credit_purchase_initiates_squad_checkout(monkeypatch, db_session) -> None:
    captured = {}
    monkeypatch.setattr(settings, "default_account_initial_credits", 0)
    monkeypatch.setattr(settings, "credit_price_naira", 50)
    monkeypatch.setattr(settings, "squad_secret_key", "test-secret")

    def fake_initiate_payment(self, **kwargs):
        captured.update(kwargs)
        return {"success": True, "data": {"checkout_url": "https://checkout.squad.test/pay"}}

    monkeypatch.setattr(SquadService, "initiate_payment", fake_initiate_payment)
    service = BillingService(db_session)
    account = service.get_or_create_account_for_key("lt_test_1234")

    purchase = service.create_credit_purchase(
        account=account,
        payload=CreditPurchaseCreateRequest(
            credits=100,
            customer_name="Ogun Ministry",
            email="billing@example.com",
        ),
    )

    assert purchase.amount_naira == Decimal("5000")
    assert purchase.checkout_url == "https://checkout.squad.test/pay"
    assert captured["amount_naira"] == Decimal("5000")
    assert captured["metadata"] == {
        "product": "lattice_credits",
        "account_id": account.id,
        "credits": 100,
    }


def test_squad_webhook_credits_paid_purchase(monkeypatch, db_session) -> None:
    monkeypatch.setattr(settings, "default_account_initial_credits", 0)
    monkeypatch.setattr(settings, "squad_secret_key", "test-secret")
    monkeypatch.setattr(
        SquadService,
        "initiate_payment",
        lambda self, **kwargs: {"success": True, "data": {"checkout_url": "https://checkout"}},
    )
    service = BillingService(db_session)
    account = service.get_or_create_account_for_key("lt_test_1234")
    purchase = service.create_credit_purchase(
        account=account,
        payload=CreditPurchaseCreateRequest(
            credits=50,
            customer_name="Ogun Ministry",
            email="billing@example.com",
        ),
    )

    updated = service.apply_squad_webhook(
        {
            "transaction_ref": purchase.transaction_reference,
            "transaction_status": "SUCCESS",
        }
    )
    db_session.refresh(account)

    assert updated is not None
    assert updated.status == "PAID"
    assert account.credit_balance == 50
