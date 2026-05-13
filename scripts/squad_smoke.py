from app.services.squad import SquadAPIError, SquadConfigurationError, SquadService


def main() -> None:
    service = SquadService(timeout=20)
    checks = []

    checks.append(
        _run_check(
            "virtual_account_lookup_missing_customer",
            lambda: service.get_virtual_account_by_customer_identifier(
                customer_identifier="LTA-SMOKE-NOT-FOUND"
            ),
        )
    )
    checks.append(
        _run_check(
            "account_lookup_docs_sample",
            lambda: service.account_lookup(bank_code="000013", account_number="0123456789"),
        )
    )

    for check in checks:
        print(check)


def _run_check(name: str, action):
    try:
        response = action()
    except SquadAPIError as exc:
        return {
            "name": name,
            "reached_squad": True,
            "status_code": exc.status_code,
            "message": str(exc),
            "response_success": None if exc.response is None else exc.response.get("success"),
        }
    except SquadConfigurationError as exc:
        return {
            "name": name,
            "reached_squad": False,
            "status_code": None,
            "message": str(exc),
            "response_success": None,
        }

    return {
        "name": name,
        "reached_squad": True,
        "status_code": response.get("status"),
        "message": response.get("message"),
        "response_success": response.get("success"),
    }


if __name__ == "__main__":
    main()
