"""Customer order messages (FR-050), no database.

docs/api/customer-account.md, "What creates a notification": which status
creates which ``kind``, that ``assigned`` creates nothing (FR-032), that the
"received" message is sent only at creation, and that no text makes a claim
FR-050, FR-027 or FR-037 forbids or contains a delivery code.
"""

import json
import re
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.modules.notifications import customer_messages
from app.modules.notifications.customer_messages import message_for
from app.modules.orders.models import DeliveryType, Order, OrderStatus

EXAMPLE = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "docs"
        / "api"
        / "examples"
        / "customer-notifications-page.json"
    ).read_text(encoding="utf-8")
)

KINDS = {
    OrderStatus.QUOTE_REQUESTED: "order_received",
    OrderStatus.AWAITING_CONFIRMATION: "order_received",
    OrderStatus.CONFIRMED: "order_confirmed",
    OrderStatus.ACCEPTED: "rider_assigned",
    OrderStatus.EN_ROUTE: "on_the_way",
    OrderStatus.DELIVERED: "delivered",
    OrderStatus.CANCELLED: "cancelled",
    OrderStatus.FAILED: "delivery_failed",
}


def order(reference: str = "MO-7KQ2M9XH4T", delivery_type: DeliveryType | None = None) -> Order:
    return Order(
        id=uuid.uuid4(),
        customer_id=uuid.uuid4(),
        reference=reference,
        delivery_type=delivery_type,
    )


@pytest.mark.parametrize("status", list(OrderStatus))
def test_each_status_has_the_contract_kind_or_none(status: OrderStatus) -> None:
    message = message_for(order(), status)
    assert (message.kind if message else None) == KINDS.get(status)


def test_assigned_creates_nothing_before_the_driver_accepts() -> None:
    # FR-032: the customer must not learn of an offer the driver may decline.
    assert message_for(order(), OrderStatus.ASSIGNED) is None


@pytest.mark.parametrize("status", list(OrderStatus))
def test_texts_make_no_forbidden_claim(status: OrderStatus) -> None:
    message = message_for(order(delivery_type=DeliveryType.TANKER), status)
    if message is None:
        return
    text = f"{message.title} {message.body}".lower()
    # FR-050 (no water-quality claim), FR-037 (no time or live position),
    # SRS §5 (never the delivery code).
    for word in ("safe", "clean", "potable", "drinking", "pure", "minutes", "eta", "code"):
        assert not re.search(rf"\b{word}\b", text), (status, word)
    assert "MO-7KQ2" in message.body and "MO-7KQ2M" not in message.body


def test_request_and_delivered_texts_match_the_contract_example() -> None:
    received, delivered = EXAMPLE["items"]
    request = message_for(order(received["reference"]), OrderStatus.QUOTE_REQUESTED)
    done = message_for(order(delivered["reference"]), OrderStatus.DELIVERED)
    assert request is not None and done is not None
    assert (request.title, request.body) == (received["title"], received["body"])
    assert (done.title, done.body) == (delivered["title"], delivered["body"])


def test_partner_word_follows_the_delivery_type() -> None:
    def title(delivery_type: DeliveryType | None) -> str:
        message = message_for(order(delivery_type=delivery_type), OrderStatus.ACCEPTED)
        assert message is not None
        return message.title

    assert title(DeliveryType.KEKE) == "Rider assigned"
    assert title(DeliveryType.TANKER) == "Driver assigned"
    assert title(None) == "Driver assigned"  # orders from before #21


@pytest.fixture
def support_phone(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Set ``SUPPORT_PHONE`` to a test number; restore the settings afterwards."""
    monkeypatch.setenv("SUPPORT_PHONE", "+2348000000099")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.usefixtures("support_phone")
def test_cancelled_and_failed_end_with_the_configured_support_number() -> None:
    # FR-055: one central value, in every notification template.
    cancelled = message_for(order(), OrderStatus.CANCELLED)
    failed = message_for(order(), OrderStatus.FAILED)
    assert cancelled is not None and failed is not None
    assert cancelled.body == "Your order MO-7KQ2 was cancelled. Questions? Call 0800 000 0099."
    assert failed.body == (
        "We could not deliver your order MO-7KQ2. Call 0800 000 0099 to arrange another delivery."
    )


def test_support_number_defaults_to_the_official_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPPORT_PHONE", raising=False)
    get_settings.cache_clear()
    try:
        message = message_for(order(), OrderStatus.CANCELLED)
    finally:
        get_settings.cache_clear()
    assert message is not None
    assert message.body.endswith("Call 0813 377 4902.")


class Recorder:
    def __init__(self) -> None:
        self.kinds: list[str] = []

    def add(self, _: object, **kwargs: object) -> None:
        self.kinds.append(str(kwargs["kind"]))


@pytest.fixture
def recorder(monkeypatch: pytest.MonkeyPatch) -> Recorder:
    recorder = Recorder()
    monkeypatch.setattr(customer_messages.service, "add", recorder.add)
    return recorder


def test_received_is_sent_only_at_creation(recorder: Recorder) -> None:
    session: object = object()
    # Moving into a creation status later (a priced order's row 3, a manual
    # quote's row 26) sends nothing.
    for status in customer_messages.CREATION_STATUSES:
        customer_messages.notify_status(session, order(), status)  # type: ignore[arg-type]
    assert recorder.kinds == []
    customer_messages.notify_status(
        session,  # type: ignore[arg-type]
        order(),
        OrderStatus.AWAITING_CONFIRMATION,
        created=True,
    )
    assert recorder.kinds == ["order_received"]


def test_created_flag_never_sends_a_later_status(recorder: Recorder) -> None:
    customer_messages.notify_status(
        object(),  # type: ignore[arg-type]
        order(),
        OrderStatus.CONFIRMED,
        created=True,
    )
    assert recorder.kinds == []
