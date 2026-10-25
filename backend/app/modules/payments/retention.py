"""Cash checks for the privacy tool (NFR-005, #129).

Called by ``app.modules.privacy`` before a customer is anonymized
(``docs/process/privacy-retention.md``, "Deletion" step 1). Cash records
are kept for at least 6 years (notice section 8) and are never changed
here; this module only tells the privacy tool what must be settled first.

What counts as unsettled (follows the cash steps in ``service.py``):

- **Refuse** while a cash collection on the customer's orders is not
  ``reconciled``: the cash is with the driver (``collected``,
  ``awaiting_remittance``) or received but not reconciled (``remitted``).
  Each of these is finished in the app.
- **Refuse** for a ``delivered`` order still ``pending_collection`` with no
  cash recorded: the cash has not been accounted for. A cancelled order
  also stays ``pending_collection``, but no cash is ever recorded on it,
  so it does not block.
- **Warn, never refuse**, for ``partially_paid`` (the balance is collected
  and recorded outside the app, fallback F9) and for an overpayment (any
  refund is outside the app, F7). The app keeps these values for good, so
  refusing would block the customer forever; the privacy contact checks
  the outside record instead.
"""

import uuid
from collections.abc import Collection

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import Order, OrderStatus, PaymentStatus
from app.modules.payments.models import CashCollection, CashCollectionStatus


def format_kobo(amount_minor_units: int) -> str:
    """Naira for a person to read, e.g. ``₦1,500.00``, without floats (SRS §5)."""
    naira, kobo = divmod(amount_minor_units, 100)
    return f"₦{naira:,}.{kobo:02d}"


async def cash_blockers(session: AsyncSession, *, order_ids: Collection[uuid.UUID]) -> list[str]:
    """Cash that must be settled before the customer is anonymized.

    Args:
        session: Database session.
        order_ids: The customer's orders.

    Returns:
        One line per blocking order, ``"<reference>: <reason>"``, sorted.
    """
    if not order_ids:
        return []
    unreconciled = await session.execute(
        select(Order.reference, CashCollection.status)
        .join(CashCollection, CashCollection.order_id == Order.id)
        .where(
            Order.id.in_(order_ids),
            CashCollection.status != CashCollectionStatus.RECONCILED,
        )
    )
    lines = [f"{reference}: cash {status.value}" for reference, status in unreconciled]
    not_recorded = await session.scalars(
        select(Order.reference)
        .outerjoin(CashCollection, CashCollection.order_id == Order.id)
        .where(
            Order.id.in_(order_ids),
            Order.status == OrderStatus.DELIVERED,
            Order.payment_status == PaymentStatus.PENDING_COLLECTION,
            CashCollection.id.is_(None),
        )
    )
    lines += [f"{reference}: cash not recorded" for reference in not_recorded]
    return sorted(lines)


async def cash_warnings(session: AsyncSession, *, order_ids: Collection[uuid.UUID]) -> list[str]:
    """Balances settled outside the app, for the privacy contact to check.

    Args:
        session: Database session.
        order_ids: The customer's orders.

    Returns:
        One line per order with a part payment (F9) or an overpayment (F7),
        sorted.
    """
    if not order_ids:
        return []
    rows = await session.execute(
        select(
            Order.reference,
            Order.payment_status,
            Order.outstanding_balance_minor_units,
            Order.overpaid_minor_units,
        ).where(
            Order.id.in_(order_ids),
            (Order.payment_status == PaymentStatus.PARTIALLY_PAID)
            | (Order.overpaid_minor_units > 0),
        )
    )
    lines: list[str] = []
    for reference, status, outstanding, overpaid in rows:
        if status == PaymentStatus.PARTIALLY_PAID:
            lines.append(
                f"{reference}: part paid, {format_kobo(outstanding)} outstanding; "
                "check the balance record kept outside the app (F9)"
            )
        if overpaid > 0:
            lines.append(
                f"{reference}: overpaid by {format_kobo(overpaid)}; "
                "check the refund record kept outside the app (F7)"
            )
    return sorted(lines)


async def count_notes(session: AsyncSession, *, order_ids: Collection[uuid.UUID]) -> int:
    """How many free-text notes the cash records on these orders carry.

    The driver's note, a correction reason and a reconciliation note may
    mention the customer; they are kept with the cash record and counted so
    the privacy contact can check them.
    """
    if not order_ids:
        return 0
    total = 0
    for column in (
        CashCollection.note,
        CashCollection.correction_reason,
        CashCollection.reconciliation_note,
    ):
        count = await session.scalar(
            select(func.count())
            .select_from(CashCollection)
            .where(CashCollection.order_id.in_(order_ids), column.is_not(None))
        )
        total += count or 0
    return total
