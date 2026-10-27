"""In-app messages to every active administrator (the header bell).

docs/api/admin-operations.md, "Notifications (admin)". The SRS has no staff
notification rule beyond FR-032 ("Admin SHALL be informed of rejection or
timeout through dashboard state") and FR-050, so the kinds are the
contract's proposal (its open question 1), built exactly as listed:

- ``driver_declined``: a driver declines an offered job (FR-032), from
  ``dispatch.service.decline_assignment``.
- ``hold_opened``: a job goes on hold for review (FR-034, FR-035), from
  ``deliveries.service`` (pickup, incident report, alternative proof).
- ``partner_pending``: a partner signs up and waits for approval, from
  ``partners.service.register_partner``.
- ``support_request``: a customer files a support request, from
  ``customers.requests.create_support_request``.

``assignment_expired`` ("an offer times out") is **not created**: offers
never expire in the backend (admin dispatch decision 1; nothing sets the
``expired`` assignment status). Whoever builds offer expiry adds the call
here (#102, technical lead's decision, 2026-10-27).

Each active admin gets their own row, so each has their own read state. The
caller adds the rows to its own transaction, so they exist only if the
action is committed, and they never change an order (FR-050). Texts never
contain a customer phone, an address or a delivery code (SRS §5
``notifications``); the full order reference is used, as staff screens show
it.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserRole
from app.modules.notifications import service

DRIVER_DECLINED = "driver_declined"
HOLD_OPENED = "hold_opened"
PARTNER_PENDING = "partner_pending"
SUPPORT_REQUEST = "support_request"

#: Every admin notification kind this build creates.
ADMIN_KINDS = frozenset({DRIVER_DECLINED, HOLD_OPENED, PARTNER_PENDING, SUPPORT_REQUEST})


async def active_admin_ids(session: AsyncSession) -> list[uuid.UUID]:
    """Return the ids of every active administrator, the recipients.

    Args:
        session: Database session.

    Returns:
        The ids, in no particular order.
    """
    return list(
        await session.scalars(
            select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
    )


async def _notify_admins(
    session: AsyncSession, *, kind: str, title: str, body: str, order_id: uuid.UUID | None
) -> None:
    for admin_id in await active_admin_ids(session):
        service.add(session, user_id=admin_id, kind=kind, title=title, body=body, order_id=order_id)


async def driver_declined(session: AsyncSession, *, order_id: uuid.UUID, reference: str) -> None:
    """Tell every admin that a driver declined an offer (FR-032). Does not commit.

    Args:
        session: The session the decline is written in.
        order_id: The order, now back in ``confirmed``.
        reference: Its public reference.
    """
    await _notify_admins(
        session,
        kind=DRIVER_DECLINED,
        title="A driver declined an order",
        body=f"{reference} needs another driver.",
        order_id=order_id,
    )


async def hold_opened(session: AsyncSession, *, order_id: uuid.UUID, reference: str) -> None:
    """Tell every admin that a job is on hold for their review. Does not commit.

    Called once per driver action, even when one pickup opens two holds
    (source mismatch and a safety concern), so admins get one message.

    Args:
        session: The session the hold is opened in.
        order_id: The order whose job is on hold.
        reference: Its public reference.
    """
    await _notify_admins(
        session,
        kind=HOLD_OPENED,
        title="An order is on hold",
        body=f"{reference} needs your review before the driver continues.",
        order_id=order_id,
    )


async def partner_pending(session: AsyncSession) -> None:
    """Tell every admin that a new partner waits for approval. Does not commit.

    No name or phone in the text: the drivers page shows them to staff.

    Args:
        session: The session the sign-up is written in.
    """
    await _notify_admins(
        session,
        kind=PARTNER_PENDING,
        title="A partner is waiting for approval",
        body="Check their vehicle and phone, then approve or suspend.",
        order_id=None,
    )


async def support_request(
    session: AsyncSession, *, order_id: uuid.UUID | None, reference: str | None
) -> None:
    """Tell every admin that a customer filed a support request. Does not commit.

    Args:
        session: The session the request is written in.
        order_id: The order it is about, or None.
        reference: That order's public reference, or None.
    """
    body = (
        f"A customer reported a problem with {reference}."
        if reference is not None
        else "A customer reported a problem."
    )
    await _notify_admins(
        session, kind=SUPPORT_REQUEST, title="New support request", body=body, order_id=order_id
    )
