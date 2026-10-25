"""Driver eligibility rules and the dispatch command line (FR-013, FR-031). No database."""

import uuid

import pytest

from app.modules.auth.models import User, UserRole
from app.modules.dispatch.cli import build_parser
from app.modules.dispatch.models import DriverProfile, VehicleProfile
from app.modules.dispatch.service import Ineligibility, eligibility_problems


def driver(**changes: object) -> User:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "name": "Sample Driver",
        "phone": "+2348090000002",
        "password_hash": "unused",
        "role": UserRole.DRIVER,
        "is_active": True,
    }
    fields.update(changes)
    return User(**fields)


VEHICLE = VehicleProfile(
    id=uuid.uuid4(), vehicle_type="Tricycle", safe_payload_litres=1200, is_active=True
)


def profile(**changes: object) -> DriverProfile:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "vehicle_profile_id": VEHICLE.id,
        "is_available": True,
    }
    fields.update(changes)
    return DriverProfile(**fields)


def problems(**changes: object) -> list[Ineligibility]:
    kwargs: dict[str, object] = {
        "driver": driver(),
        "profile": profile(),
        "vehicle": VEHICLE,
        "order_litres": 1200,
        "has_live_job": False,
    }
    kwargs.update(changes)
    return eligibility_problems(**kwargs)  # type: ignore[arg-type]


def test_an_available_driver_with_enough_payload_is_eligible() -> None:
    assert problems() == []


def test_payload_must_cover_the_order_in_one_trip() -> None:
    # BR-03: never allocate more than the verified payload.
    assert problems(order_litres=1201) == [Ineligibility.OVER_PAYLOAD]


def test_every_problem_is_reported_at_once() -> None:
    assert problems(
        driver=driver(is_active=False),
        profile=profile(is_available=False),
        vehicle=VehicleProfile(
            id=VEHICLE.id, vehicle_type="Tricycle", safe_payload_litres=600, is_active=False
        ),
        order_litres=1200,
        has_live_job=True,
    ) == [
        Ineligibility.INACTIVE,
        Ineligibility.UNAVAILABLE,
        Ineligibility.VEHICLE_INACTIVE,
        Ineligibility.OVER_PAYLOAD,
        Ineligibility.BUSY,
    ]


def test_accounts_that_are_not_drivers_or_have_no_profile() -> None:
    assert problems(driver=driver(role=UserRole.ADMIN)) == [Ineligibility.NOT_A_DRIVER]
    assert problems(profile=None, vehicle=None) == [Ineligibility.NO_DRIVER_PROFILE]


@pytest.mark.parametrize(
    "argv",
    [
        ["add-vehicle", "--type", "Tricycle", "--payload-litres", "0"],
        ["add-vehicle", "--type", "Tricycle", "--payload-litres", "100001"],
        ["add-vehicle", "--type", "Tricycle", "--payload-litres", "1.5"],
        ["add-vehicle", "--type", "   ", "--payload-litres", "1000"],
        ["set-driver", "--phone", "12345", "--vehicle", str(uuid.uuid4())],
        ["set-driver", "--phone", "08090000002", "--vehicle", "not-a-uuid"],
        ["set-availability", "--phone", "08090000002"],
    ],
)
def test_cli_rejects_bad_arguments(argv: list[str]) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(argv)


def test_cli_normalizes_phone_and_parses_availability() -> None:
    args = build_parser().parse_args(
        ["set-availability", "--phone", "0809 000 0002", "--unavailable"]
    )
    assert (args.phone, args.available) == ("+2348090000002", False)
    vehicle = build_parser().parse_args(
        ["add-vehicle", "--type", " Truck ", "--payload-litres", "5000"]
    )
    assert (vehicle.type, vehicle.payload_litres) == ("Truck", 5000)
