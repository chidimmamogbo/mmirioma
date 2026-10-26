"""Command-line management of vehicles and drivers for the technical lead.

There are no admin screens for this yet (technical lead, 2026-10-19), so
vehicle profiles and driver profiles are managed here, like staff accounts
(``app.modules.auth.cli``). Run from ``backend/`` with the virtualenv active
and ``DATABASE_URL`` configured::

    python -m app.modules.dispatch.cli add-vehicle --type "Tricycle, 1,000 L tank" \\
        --payload-litres 1000
    python -m app.modules.dispatch.cli list-vehicles
    python -m app.modules.dispatch.cli set-driver --phone 08000000002 --vehicle <vehicle id> \\
        --delivery-type keke --plate "ENU-123-AB"
    python -m app.modules.dispatch.cli set-availability --phone 08000000002 --unavailable
    python -m app.modules.dispatch.cli list-drivers

The payload must be the vehicle's **verified** safe payload (FR-013), checked
by staff before it is entered: the system cannot verify it. A driver profile
created here starts ``approved``, since staff checked the driver first
(docs/api/partners.md). ``--delivery-type`` and ``--plate`` fill the partner
app's vehicle details; without them those show as unknown.
"""

import argparse
import asyncio
import sys
import uuid

import app.models  # noqa: F401  (registers every model: commands write across modules)
from app.core.database import dispose_engine, get_sessionmaker
from app.modules.dispatch import service
from app.modules.dispatch.models import (
    MAX_SAFE_PAYLOAD_LITRES,
    VEHICLE_TYPE_MAX_LENGTH,
    DeliveryType,
)
from app.modules.dispatch.plates import normalize_plate
from app.shared.phone import normalize_nigerian_phone


async def _run(args: argparse.Namespace) -> str:
    async with get_sessionmaker()() as session:
        if args.command == "add-vehicle":
            vehicle = await service.create_vehicle_profile(
                session, vehicle_type=args.type, safe_payload_litres=args.payload_litres
            )
            return (
                f"Created vehicle {vehicle.id}: "
                f"{vehicle.vehicle_type}, {vehicle.safe_payload_litres} L."
            )
        if args.command == "list-vehicles":
            vehicles = await service.list_vehicle_profiles(session)
            lines = [
                f"{v.id}  {v.safe_payload_litres:>6} L  "
                f"{'active  ' if v.is_active else 'inactive'}  {v.vehicle_type}"
                for v in vehicles
            ]
            return "\n".join(lines) or "No vehicles yet."
        if args.command == "set-driver":
            profile = await service.set_driver_vehicle(
                session,
                phone=args.phone,
                vehicle_profile_id=args.vehicle,
                delivery_type=args.delivery_type,
                plate=args.plate,
            )
            return f"Driver profile {profile.id} uses vehicle {profile.vehicle_profile_id}."
        if args.command == "set-availability":
            profile = await service.set_driver_availability(
                session, phone=args.phone, available=args.available
            )
            state = "available" if profile.is_available else "unavailable"
            return f"Driver profile {profile.id} is now {state} for new work."
        rows = await service.list_driver_profiles(session)
        lines = [
            f"{user.name}  {'available  ' if profile.is_available else 'unavailable'}  "
            f"{'active' if user.is_active else 'inactive'}  {profile.approval_status:<9}  "
            + (
                f"{vehicle.safe_payload_litres} L  {vehicle.vehicle_type}"
                if vehicle is not None
                else "no verified vehicle"
            )
            for profile, user, vehicle in rows
        ]
        return "\n".join(lines) or "No driver profiles yet."


async def _main(args: argparse.Namespace) -> str:
    try:
        return await _run(args)
    finally:
        await dispose_engine()


def _vehicle_type(raw: str) -> str:
    value = raw.strip()
    if not 1 <= len(value) <= VEHICLE_TYPE_MAX_LENGTH:
        raise argparse.ArgumentTypeError(f"use 1-{VEHICLE_TYPE_MAX_LENGTH} characters")
    return value


def _payload(raw: str) -> int:
    try:
        litres = int(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("a whole number of litres") from exc
    if not 1 <= litres <= MAX_SAFE_PAYLOAD_LITRES:
        raise argparse.ArgumentTypeError(f"1-{MAX_SAFE_PAYLOAD_LITRES} litres")
    return litres


def _phone(raw: str) -> str:
    try:
        return normalize_nigerian_phone(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def _plate(raw: str) -> str:
    try:
        return normalize_plate(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def build_parser() -> argparse.ArgumentParser:
    """The command-line interface (exposed for tests)."""
    parser = argparse.ArgumentParser(prog="python -m app.modules.dispatch.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("add-vehicle", help="add a vehicle profile")
    add.add_argument("--type", required=True, type=_vehicle_type)
    add.add_argument("--payload-litres", required=True, type=_payload)
    commands.add_parser("list-vehicles", help="list vehicle profiles")
    driver = commands.add_parser("set-driver", help="give a driver account its vehicle")
    driver.add_argument("--phone", required=True, type=_phone)
    driver.add_argument("--vehicle", required=True, type=uuid.UUID)
    driver.add_argument("--delivery-type", type=DeliveryType, choices=list(DeliveryType))
    driver.add_argument("--plate", type=_plate)
    availability = commands.add_parser("set-availability", help="available for new work or not")
    availability.add_argument("--phone", required=True, type=_phone)
    state = availability.add_mutually_exclusive_group(required=True)
    state.add_argument("--available", dest="available", action="store_true")
    state.add_argument("--unavailable", dest="available", action="store_false")
    commands.add_parser("list-drivers", help="list driver profiles")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Parse arguments and run one command.

    Args:
        argv: Arguments without the program name; defaults to ``sys.argv[1:]``.

    Returns:
        Process exit code.
    """
    args = build_parser().parse_args(argv)
    try:
        print(asyncio.run(_main(args)))
    except LookupError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
