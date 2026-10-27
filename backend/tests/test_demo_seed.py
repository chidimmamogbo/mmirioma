"""Demo seed rules that need no database (S1-18, BR-09, NFR-031)."""

import asyncio
import uuid
from types import SimpleNamespace

import pytest

from app.modules.auth.models import User, UserRole
from app.modules.demo import seed
from app.modules.demo.seed import (
    DEMO_ACCOUNTS,
    DEMO_DECLARED_GALLONS,
    DEMO_DRIVER_PHONE,
    DEMO_PLATE,
    DEMO_SAFE_PAYLOAD_LITRES,
    DEMO_VEHICLE_TYPE,
    DEMO_ZONE_NAME,
    DemoSeedError,
    is_demo_account,
    seed_demo_data,
)
from app.modules.dispatch.models import (
    MAX_DECLARED_GALLONS,
    MAX_SAFE_PAYLOAD_LITRES,
    MIN_DECLARED_GALLONS,
    VEHICLE_TYPE_MAX_LENGTH,
)
from app.modules.dispatch.plates import normalize_plate
from app.shared.demo_accounts import is_demo_phone
from app.shared.lagos_time import lagos_today
from app.shared.phone import normalize_nigerian_phone


def account(name: str, phone: str) -> User:
    return User(id=uuid.uuid4(), name=name, phone=phone, password_hash="x", role=UserRole.ADMIN)


@pytest.mark.parametrize(
    ("phone", "expected"),
    [
        ("+2348000090000", True),
        ("+2348000090099", True),
        ("+2348000090100", False),
        ("+2348000000001", False),  # the contract's example number
        ("+23480000900", False),
        ("+234800009001x", False),
    ],
)
def test_reserved_phone_block(phone: str, expected: bool) -> None:
    assert is_demo_phone(phone) is expected


def test_demo_account_needs_reserved_phone_and_demo_name() -> None:
    assert is_demo_account(account("Demo Dispatcher", "+2348000090001"))
    # A real person who registered a reserved number is not demo data.
    assert not is_demo_account(account("Real Person", "+2348000090001"))
    assert not is_demo_account(account("Demo Dispatcher", "+2348000000001"))


def test_every_demo_account_is_recognizable() -> None:
    phones = [spec.phone for spec in DEMO_ACCOUNTS]
    assert len(set(phones)) == len(phones)
    assert {spec.role for spec in DEMO_ACCOUNTS} == set(UserRole)
    for spec in DEMO_ACCOUNTS:
        assert normalize_nigerian_phone(spec.phone) == spec.phone
        assert is_demo_account(account(spec.name, spec.phone)), spec.name


def test_every_demo_order_is_labelled_and_valid() -> None:
    orders = [order for spec in DEMO_ACCOUNTS for order in spec.orders]
    assert orders, "the dataset must include orders"
    for order in orders:
        # Customers never see is_simulated, so the text itself says "Demo".
        assert order.contact_name.startswith("Demo ")
        assert order.delivery_address.startswith("Demo address")
        assert is_demo_phone(order.contact_phone)
        for note in (order.landmark, order.delivery_instructions):
            assert note is None or note.startswith("Demo ")
        # Raises if the data breaks the API's field rules.
        request = seed._order_request(order, lagos_today())
        assert request.preferred_delivery_date is None or (
            request.preferred_delivery_date >= lagos_today()
        )


def test_demo_driver_details_are_labelled_and_valid() -> None:
    driver = next(spec for spec in DEMO_ACCOUNTS if spec.phone == DEMO_DRIVER_PHONE)
    assert driver.role is UserRole.DRIVER
    # These rows have no simulated flag, so their names say "Demo" (BR-09).
    assert DEMO_ZONE_NAME.startswith("Demo ")
    assert DEMO_VEHICLE_TYPE.startswith("Demo ")
    assert len(DEMO_VEHICLE_TYPE) <= VEHICLE_TYPE_MAX_LENGTH
    assert DEMO_PLATE.startswith("DEMO")
    assert normalize_plate(DEMO_PLATE) == DEMO_PLATE
    assert MIN_DECLARED_GALLONS <= DEMO_DECLARED_GALLONS <= MAX_DECLARED_GALLONS
    assert 1 <= DEMO_SAFE_PAYLOAD_LITRES <= MAX_SAFE_PAYLOAD_LITRES
    # 1 local gallon = 4 L (api-mapping.md): the declared tank is the payload.
    assert DEMO_DECLARED_GALLONS * 4 == DEMO_SAFE_PAYLOAD_LITRES


def test_demo_driver_can_carry_every_demo_order() -> None:
    largest = max(order.quantity_litres for spec in DEMO_ACCOUNTS for order in spec.orders)
    assert largest <= DEMO_SAFE_PAYLOAD_LITRES  # BR-03: never over the payload


def test_only_customers_have_orders() -> None:
    for spec in DEMO_ACCOUNTS:
        assert not spec.orders or spec.role is UserRole.CUSTOMER


def test_seed_refuses_production_before_touching_the_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(seed, "get_settings", lambda: SimpleNamespace(is_production=True))

    class NoDatabase:
        def __getattr__(self, name: str) -> object:
            raise AssertionError(f"database used: {name}")

    with pytest.raises(DemoSeedError, match="production"):
        asyncio.run(seed_demo_data(NoDatabase(), password="unused password"))  # type: ignore[arg-type]


def test_command_refuses_production_without_prompting(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(seed, "get_settings", lambda: SimpleNamespace(is_production=True))

    def no_prompt(_: str) -> str:
        raise AssertionError("prompted for a password")

    monkeypatch.setattr(seed.getpass, "getpass", no_prompt)

    assert seed.main() == 1
    assert "production" in capsys.readouterr().err


def test_command_rejects_mismatched_passwords(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    answers = iter(["first password", "second password"])
    monkeypatch.setattr(seed.getpass, "getpass", lambda _: next(answers))

    assert seed.main() == 1
    assert "do not match" in capsys.readouterr().err
