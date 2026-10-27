"""In-app messages to a customer when their order changes status (FR-050).

docs/api/customer-account.md, "What creates a notification". Only changes
the customer may know about create a message:

| Order moves to | ``kind`` |
| --- | --- |
| ``quote_requested`` or ``awaiting_confirmation``, at creation only | ``order_received`` |
| ``confirmed`` | ``order_confirmed`` |
| ``accepted`` | ``rider_assigned`` |
| ``en_route`` | ``on_the_way`` |
| ``delivered`` | ``delivered`` |
| ``cancelled`` | ``cancelled`` |
| ``failed`` | ``delivery_failed`` |

Every other status creates nothing. In particular ``assigned`` does not:
the customer must not learn of an assignment before the driver accepts it
(FR-032). The texts never promise unverified delivery or water quality
(FR-050), never call a request a guaranteed delivery (FR-027), never give a
time or live position (FR-037), and never contain the delivery code (SRS §5
``notifications``).

The message is added to the caller's transaction (``orders.service``), so it
exists only if the status change is committed, and it never changes the
order (FR-050).
"""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications import service
from app.modules.orders.models import DeliveryType, Order, OrderStatus

#: Characters of the reference shown in a message ("MO-7KQ2"), as the
#: customer app shortens it.
SHORT_REFERENCE_LENGTH = 7


@dataclass(frozen=True)
class Message:
    """One message: its contract ``kind`` and the text the customer sees."""

    kind: str
    title: str
    body: str


def message_for(order: Order, status: OrderStatus) -> Message | None:
    """Return the message for an order that just moved to ``status``, if any.

    Args:
        order: The order (its reference and delivery type are used).
        status: The status it moved to, or was created in.

    Returns:
        The message, or None when the customer is not told about this status.
    """
    ref = order.reference[:SHORT_REFERENCE_LENGTH]
    # Keke riders and tanker drivers (design decision 9); an order from
    # before #21 has no delivery type, so the neutral word is used.
    partner = "rider" if order.delivery_type is DeliveryType.KEKE else "driver"
    match status:
        case OrderStatus.QUOTE_REQUESTED:
            return Message(
                "order_received",
                "Request received",
                f"We have your request {ref}. We will confirm the price and time with you.",
            )
        case OrderStatus.AWAITING_CONFIRMATION:
            return Message(
                "order_received",
                "Order received",
                f"We have your order {ref}. We will call you to agree the delivery time.",
            )
        case OrderStatus.CONFIRMED:
            return Message(
                "order_confirmed",
                "Order confirmed",
                f"Your order {ref} is confirmed. We will tell you when a {partner} takes it.",
            )
        case OrderStatus.ACCEPTED:
            return Message(
                "rider_assigned",
                f"{partner.capitalize()} assigned",
                f"A {partner} has accepted your order {ref}.",
            )
        case OrderStatus.EN_ROUTE:
            return Message(
                "on_the_way",
                "On the way",
                f"Your order {ref} is on its way to you.",
            )
        case OrderStatus.DELIVERED:
            return Message(
                "delivered",
                "Delivered",
                f"Order {ref} was delivered. Thank you for ordering with MmiriOma.",
            )
        case OrderStatus.CANCELLED:
            return Message(
                "cancelled",
                "Order cancelled",
                f"Your order {ref} was cancelled. Contact us if you have a question.",
            )
        case OrderStatus.FAILED:
            return Message(
                "delivery_failed",
                "Delivery not completed",
                f"We could not deliver your order {ref}. Contact us to arrange another delivery.",
            )
        case _:
            return None


#: Statuses an order is created in. Their message is sent once, at creation:
#: a priced order passes through ``quote_requested`` on its way to
#: ``awaiting_confirmation`` in the same transaction, and a manual quote
#: recorded at confirmation (row 26) moves a request to
#: ``awaiting_confirmation`` long after it was received.
CREATION_STATUSES = frozenset({OrderStatus.QUOTE_REQUESTED, OrderStatus.AWAITING_CONFIRMATION})


def notify_status(
    session: AsyncSession, order: Order, status: OrderStatus, *, created: bool = False
) -> None:
    """Add the customer's message for this status change, if it has one. Does not commit.

    Args:
        session: The session the status change is written in.
        order: The order; its customer is the recipient.
        status: The status it moved to, or was created in.
        created: True only for the order's starting status, once, when it is
            created (``orders.service.create_order``). The ``order_received``
            message is sent only then.
    """
    if (status in CREATION_STATUSES) is not created:
        return
    message = message_for(order, status)
    if message is None:
        return
    service.add(
        session,
        user_id=order.customer_id,
        kind=message.kind,
        title=message.title,
        body=message.body,
        order_id=order.id,
    )
