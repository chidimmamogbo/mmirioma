"""Saved addresses: the ``customer_addresses`` table (SRS §5 ``addresses``).

One table for both contracts that write it: the customer's own addresses
(docs/api/customer-account.md, "Saved addresses") and the admin side
(docs/api/admin-directory.md, "Customers", built in #45). Both use the same
rules: a zone is required (FR-020), the label is 1-50 characters, and a
customer has at most one default address.

An order copies the address text when it is placed, so changing or removing
a saved address never changes an order (FR-024). The SRS lists latitude and
longitude as optional; they are left out until a screen collects them
(admin-directory.md, "Data needed").
"""

import uuid

from sqlalchemy import ForeignKey, Index, String, false, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.orders.models import DELIVERY_ADDRESS_MAX_LENGTH, LANDMARK_MAX_LENGTH

#: Labels such as "Home" or "Mum's house": trimmed, 1-50 characters, on both
#: the customer and the admin side (customer-account.md, decision 13).
LABEL_MAX_LENGTH = 50


class CustomerAddress(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One saved delivery address of a customer.

    Attributes:
        customer_id: The customer's account. RESTRICT, as the contract asks:
            the privacy tool removes addresses before it deletes or
            anonymizes an account (``app.modules.customers.retention``).
        zone_id: The service zone the customer picked (FR-020). Kept when
            the zone is switched off; the quote then refuses it (FR-010).
        label: Trimmed name, 1-50 characters.
        address: Trimmed free text, 5-500 characters (as on orders).
        landmark: Optional, up to 200 characters; null when not given.
        is_default: The address offered first. At most one per customer,
            enforced by the partial unique index below; the service keeps
            exactly one whenever the customer has any.
    """

    __tablename__ = "customer_addresses"
    __table_args__ = (
        # The database decides, so two concurrent requests can never leave a
        # customer with two defaults.
        Index(
            "uq_customer_addresses_one_default",
            "customer_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("service_zones.id", ondelete="RESTRICT"), index=True
    )
    label: Mapped[str] = mapped_column(String(LABEL_MAX_LENGTH))
    address: Mapped[str] = mapped_column(String(DELIVERY_ADDRESS_MAX_LENGTH))
    landmark: Mapped[str | None] = mapped_column(String(LANDMARK_MAX_LENGTH))
    is_default: Mapped[bool] = mapped_column(default=False, server_default=false())
