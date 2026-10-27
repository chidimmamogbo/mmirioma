"""Seed a demo dataset that can never be mistaken for real pilot data (S1-18).

Run from ``backend/`` with the virtualenv active and ``DATABASE_URL`` set::

    python -m app.modules.demo.seed

It prompts once for a password shared by every demo account (never accepted
as an argument, so it stays out of shell history), then creates:

- one admin (dispatcher), one driver and two customers;
- order requests for each customer, all with ``is_simulated = true``;
- an active service zone named "Demo zone" (#63), so partner sign-up has a
  zone to pick;
- for the demo driver, an ``approved``, available tanker profile with a
  demo vehicle, plate ``DEMO-001`` and the demo zone (#63), so dispatch can
  offer them every demo order.

Demo customers are marked phone-verified (orders need a verified phone,
FR-003; their fictional numbers cannot receive SMS). Customers seeded before
that rule are marked verified on the next run.

How demo data is recognized (BR-09, NFR-031):

- **Orders** carry the ``is_simulated`` flag, so they are excluded from real
  metrics and shown as simulated to staff. Their contact names, addresses and
  notes also start with "Demo", because customers never see the flag.
- **Accounts** have no simulated flag. A demo account is one whose phone is in
  the reserved block ``+23480000900NN`` (local ``080000900NN``) **and** whose
  name starts with ``Demo``. Both must hold; see :func:`is_demo_account`.
  The block is not used by any example or test elsewhere in the repository.
- **The zone, vehicle and plate** have no simulated flag either, so their
  names say "Demo": zone "Demo zone", vehicle "Demo tanker, ...", plate
  ``DEMO-001``. The vehicle's safe payload is a demo value chosen for #63
  (Bonvee120, 2026-10-27), not a verified one (FR-013).

Rules:

- Refuses to run when ``APP_ENV=production``.
- Safe to run again: existing demo accounts are reused (their passwords are
  not changed), and a demo customer who already has orders gets no new ones.
  A zone already named "Demo zone" is reused, and an existing demo driver
  profile is never changed.
- Before creating anything it checks every reserved phone. If one belongs to
  an account that is not the expected demo account (wrong name or role), it
  stops without changing anything.
- Orders are validated with the API's own ``OrderCreate`` rules, and all stay
  in ``quote_requested`` with no price: no transitions exist yet, and
  inventing later statuses would fake an order history.
"""

import asyncio
import getpass
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

import app.models  # noqa: F401  (registers every model: commands write across modules)
from app.core.config import get_settings
from app.core.database import dispose_engine, get_sessionmaker
from app.core.errors import APIError
from app.modules.auth import service as auth_service
from app.modules.auth.models import User, UserRole
from app.modules.auth.schemas import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH
from app.modules.dispatch import service as dispatch_service
from app.modules.dispatch.models import DeliveryType
from app.modules.orders import service as orders_service
from app.modules.orders.schemas import OrderCreate
from app.modules.pricing import service as pricing_service
from app.modules.pricing.service import Coordinates, ZoneData
from app.shared.demo_accounts import is_demo_identity
from app.shared.lagos_time import lagos_today


class DemoSeedError(Exception):
    """The seed refused to run; the message says why and is safe to print."""


@dataclass(frozen=True)
class DemoOrder:
    """One demo order request, in ``OrderCreate`` field names.

    Attributes:
        quantity_litres: Requested litres.
        contact_name: Receiver's name.
        contact_phone: Receiver's phone (in the reserved block).
        delivery_address: Free-text address.
        landmark: Optional landmark.
        delivery_instructions: Optional instructions.
        days_from_today: Preferred delivery date as days after today in Lagos,
            or None for no preference. Relative, so it is never in the past.
    """

    quantity_litres: int
    contact_name: str
    contact_phone: str
    delivery_address: str
    landmark: str | None = None
    delivery_instructions: str | None = None
    days_from_today: int | None = None


@dataclass(frozen=True)
class DemoAccount:
    """One demo account and, for customers, its orders."""

    role: UserRole
    name: str
    phone: str
    orders: tuple[DemoOrder, ...] = ()


DEMO_ACCOUNTS: tuple[DemoAccount, ...] = (
    DemoAccount(UserRole.ADMIN, "Demo Dispatcher", "+2348000090001"),
    DemoAccount(UserRole.DRIVER, "Demo Driver", "+2348000090002"),
    DemoAccount(
        UserRole.CUSTOMER,
        "Demo Customer One",
        "+2348000090011",
        orders=(
            DemoOrder(
                quantity_litres=1_200,
                contact_name="Demo Customer One",
                contact_phone="+2348000090011",
                delivery_address="Demo address - 1 Sample Close, Independence Layout, Enugu",
                landmark="Demo landmark - opposite the blue gate",
                days_from_today=1,
            ),
            DemoOrder(
                quantity_litres=600,
                contact_name="Demo Customer One",
                contact_phone="+2348000090011",
                delivery_address="Demo address - 1 Sample Close, Independence Layout, Enugu",
            ),
        ),
    ),
    DemoAccount(
        UserRole.CUSTOMER,
        "Demo Customer Two",
        "+2348000090012",
        orders=(
            DemoOrder(
                quantity_litres=2_000,
                contact_name="Demo Receiver Two",
                contact_phone="+2348000090021",
                delivery_address="Demo address - 4 Sample Street, New Haven, Enugu",
                delivery_instructions="Demo instructions - tank is behind the house",
                days_from_today=2,
            ),
            DemoOrder(
                quantity_litres=3_000,
                contact_name="Demo Customer Two",
                contact_phone="+2348000090012",
                delivery_address="Demo address - 4 Sample Street, New Haven, Enugu",
            ),
        ),
    ),
)


#: The demo driver's dispatch details (#63, decided by Bonvee120 on 2026-10-27).
#: A tanker can carry every demo order (600 to 3,000 L). 1,000 local gallons
#: is 4,000 L (1 gallon = 4 L, docs/architecture/api-mapping.md), the mock's
#: demo tanker. The payload is a demo value, not a verified one (FR-013).
DEMO_DRIVER_PHONE = "+2348000090002"
DEMO_ZONE_NAME = "Demo zone"
#: Roughly central Enugu; demo data, not a surveyed point.
DEMO_ZONE_CENTRE = Coordinates(latitude=6.45, longitude=7.51)
DEMO_VEHICLE_TYPE = "Demo tanker, 1,000 gal (4,000 L)"
DEMO_SAFE_PAYLOAD_LITRES = 4_000
DEMO_DECLARED_GALLONS = 1_000
DEMO_PLATE = "DEMO-001"


def is_demo_account(user: User) -> bool:
    """Whether an account is demo data: reserved phone **and** "Demo" name.

    Accounts have no ``is_simulated`` column, so both markers are required.
    A real person who registered a reserved number still fails the name check.

    Args:
        user: The account to classify.

    Returns:
        True for demo accounts.
    """
    return is_demo_identity(name=user.name, phone=user.phone)


@dataclass
class SeedReport:
    """What a seed run did.

    Attributes:
        accounts_created: Phones of accounts created in this run.
        accounts_existing: Phones of demo accounts that already existed.
        orders_created: References of orders created in this run.
        customers_skipped: Phones of demo customers that already had orders.
        zone_created: Whether this run created the demo zone.
        driver_profile_created: Whether this run created the demo driver's
            profile and vehicle.
    """

    accounts_created: list[str] = field(default_factory=list)
    accounts_existing: list[str] = field(default_factory=list)
    orders_created: list[str] = field(default_factory=list)
    customers_skipped: list[str] = field(default_factory=list)
    zone_created: bool = False
    driver_profile_created: bool = False


def _order_request(spec: DemoOrder, today: date) -> OrderCreate:
    preferred = None if spec.days_from_today is None else today + timedelta(spec.days_from_today)
    # Validate exactly as the API would, so demo data obeys the contract.
    return OrderCreate.model_validate(
        {
            "idempotency_key": uuid.uuid4(),
            "quantity_litres": spec.quantity_litres,
            "contact_name": spec.contact_name,
            "contact_phone": spec.contact_phone,
            "delivery_address": spec.delivery_address,
            "landmark": spec.landmark,
            "delivery_instructions": spec.delivery_instructions,
            "preferred_delivery_date": preferred,
        }
    )


async def seed_demo_data(session: AsyncSession, *, password: str) -> SeedReport:
    """Create the demo accounts and orders that do not exist yet.

    Args:
        session: Database session; the services it calls commit.
        password: Password for newly created demo accounts.

    Returns:
        A report of what was created or reused.

    Raises:
        DemoSeedError: In production, or if a reserved phone belongs to an
            account that is not the expected demo account. Nothing is changed
            in either case.
    """
    if get_settings().is_production:
        raise DemoSeedError("Refusing to seed demo data when APP_ENV=production.")

    # Check every reserved phone before writing, so a conflict changes nothing.
    existing: dict[str, User] = {}
    for spec in DEMO_ACCOUNTS:
        user = await auth_service.get_user_by_phone(session, spec.phone)
        if user is None:
            continue
        if not is_demo_account(user) or user.name != spec.name or user.role != spec.role:
            raise DemoSeedError(
                f"Reserved demo phone {spec.phone} belongs to an account that is not "
                f"{spec.name!r} ({spec.role}). Nothing was changed."
            )
        existing[spec.phone] = user

    report = SeedReport()
    users: dict[str, User] = {}
    for spec in DEMO_ACCOUNTS:
        if spec.phone in existing:
            users[spec.phone] = existing[spec.phone]
            report.accounts_existing.append(spec.phone)
        else:
            users[spec.phone] = await auth_service.create_user(
                session, name=spec.name, phone=spec.phone, password=password, role=spec.role
            )
            report.accounts_created.append(spec.phone)

    # Demo customers place orders live in the demo, and orders need a
    # verified phone (FR-003). Their numbers are fictional, so no SMS can
    # reach them: the seed marks them verified, also for accounts seeded
    # before verification existed. They stay identifiable as demo data.
    for spec in DEMO_ACCOUNTS:
        demo_user = users[spec.phone]
        if spec.role is UserRole.CUSTOMER and demo_user.phone_verified_at is None:
            await auth_service.set_phone_verified(session, demo_user)

    today = lagos_today()
    for spec in DEMO_ACCOUNTS:
        if not spec.orders:
            continue
        customer = users[spec.phone]
        _, order_count = await orders_service.list_customer_orders(
            session, customer_id=customer.id, limit=1, offset=0
        )
        if order_count:
            report.customers_skipped.append(spec.phone)
            continue
        for order_spec in spec.orders:
            order, _ = await orders_service.create_order(
                session,
                customer_id=customer.id,
                request=_order_request(order_spec, today).to_new_order(),
                is_simulated=True,
            )
            report.orders_created.append(order.reference)

    admin = next(users[spec.phone] for spec in DEMO_ACCOUNTS if spec.role is UserRole.ADMIN)
    zone_id, report.zone_created = await _demo_zone(session, admin)
    report.driver_profile_created = await _demo_driver_profile(
        session, users[DEMO_DRIVER_PHONE], zone_id
    )
    return report


async def _demo_zone(session: AsyncSession, admin: User) -> tuple[uuid.UUID, bool]:
    """The demo zone's id, creating it (audited as the demo admin) if missing.

    Returns:
        The zone id, and whether it was created now.
    """
    for view in await pricing_service.list_zones(session):
        if view.zone.name.lower() == DEMO_ZONE_NAME.lower():
            return view.zone.id, False
    view = await pricing_service.create_zone(
        session,
        actor=admin,
        data=ZoneData(
            name=DEMO_ZONE_NAME, is_active=True, centre=DEMO_ZONE_CENTRE, boundary=None, fees=[]
        ),
    )
    return view.zone.id, True


async def _demo_driver_profile(session: AsyncSession, driver: User, zone_id: uuid.UUID) -> bool:
    """Give the demo driver an approved tanker profile, unless they have one.

    ``set_driver_vehicle`` creates a new profile ``approved`` and available
    (the command-line rule), which is what the demo needs. An existing
    profile is left exactly as it is, whatever it holds.

    Returns:
        Whether a profile was created now.
    """
    profiles = await dispatch_service.list_driver_profiles(session)
    if any(user.id == driver.id for _, user, _ in profiles):
        return False
    vehicle = await dispatch_service.create_vehicle_profile(
        session, vehicle_type=DEMO_VEHICLE_TYPE, safe_payload_litres=DEMO_SAFE_PAYLOAD_LITRES
    )
    await dispatch_service.set_driver_vehicle(
        session,
        phone=driver.phone,
        vehicle_profile_id=vehicle.id,
        delivery_type=DeliveryType.TANKER,
        plate=DEMO_PLATE,
        declared_capacity_gallons=DEMO_DECLARED_GALLONS,
        zone_id=zone_id,
    )
    return True


def _read_password() -> str:
    password = getpass.getpass("Password for new demo accounts: ")
    if not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
        raise DemoSeedError(
            f"Password must be {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} characters."
        )
    if getpass.getpass("Repeat password: ") != password:
        raise DemoSeedError("Passwords do not match.")
    return password


async def _main(password: str) -> SeedReport:
    try:
        async with get_sessionmaker()() as session:
            return await seed_demo_data(session, password=password)
    finally:
        await dispose_engine()


def _summary(report: SeedReport) -> str:
    lines = [
        f"Accounts created: {len(report.accounts_created)}; "
        f"already present: {len(report.accounts_existing)}.",
        f"Simulated orders created: {len(report.orders_created)}"
        + (f" ({', '.join(report.orders_created)})" if report.orders_created else "")
        + ".",
    ]
    if report.customers_skipped:
        lines.append(
            f"Skipped {len(report.customers_skipped)} demo customer(s) that already have orders."
        )
    lines.append(f"{DEMO_ZONE_NAME}: {'created' if report.zone_created else 'already present'}.")
    lines.append(
        "Demo driver profile: "
        + (
            f"created (approved tanker {DEMO_PLATE}, {DEMO_SAFE_PAYLOAD_LITRES:,} L)."
            if report.driver_profile_created
            else "already present, left unchanged."
        )
    )
    lines.append("Sign in with the demo phones (local form):")
    lines += [
        f"  {spec.role.value:<8} {spec.name:<18} 0{spec.phone.removeprefix('+234')}"
        for spec in DEMO_ACCOUNTS
    ]
    return "\n".join(lines)


def main() -> int:
    """Run the seed from the command line.

    Returns:
        Process exit code.
    """
    try:
        if get_settings().is_production:
            raise DemoSeedError("Refusing to seed demo data when APP_ENV=production.")
        # Prompt before starting the event loop; getpass blocks.
        print(_summary(asyncio.run(_main(_read_password()))))
    except DemoSeedError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except APIError as exc:
        # For example a reserved phone registered between the check and the
        # insert. The message is the API's safe, user-facing text.
        print(f"Error: {exc.message}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
