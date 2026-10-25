"""Water source persistence (SRS §5, FR-011, FR-012, FR-014).

- ``water_sources``: a supplier or source where water is collected, with an
  approximate pickup location.
- ``water_categories``: the two categories the app offers, Potable Water and
  Utility Water (FR-014), seeded by migration ``0011``. Labels are
  admin-configured; a later change never alters a confirmed order, which
  keeps its own copy of the label (FR-024).
- ``water_source_categories``: one activation per source and category, the
  FR-012 safety gate. A source may serve a category only while its
  activation is ``activated`` and its laboratory approval is current
  (:mod:`app.modules.sources.eligibility`). It records the laboratory report
  **reference** only: the reports are kept privately outside the app (pilot
  fallback F1). The supplier's cost per litre is stored here and never sent
  to a client.

These rows are entered by the technical lead with the command-line tool
(:mod:`app.modules.sources.cli`, F1). A row here records that the technical
lead entered an approval; it is not itself legal compliance (FR-012).
"""

import uuid
from datetime import date
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
    false,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin

SOURCE_NAME_MAX_LENGTH = 120
APPROXIMATE_LOCATION_MAX_LENGTH = 200
CATEGORY_CODE_MAX_LENGTH = 20
CATEGORY_LABEL_MAX_LENGTH = 60
SUPPORTED_USES_MAX_LENGTH = 500
REPORT_REFERENCE_MAX_LENGTH = 100
STATUS_REASON_MAX_LENGTH = 500


class WaterSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A supplier or source where water is collected.

    Attributes:
        name: Supplier or source name shown to drivers, e.g. "Sample Borehole A".
        approximate_location: Approximate pickup location in words (FR-011),
            enough for a driver to find it; no coordinates yet.
        is_simulated: True for demo data (BR-09). A real order may still use
            a simulated source for now (order confirmation contract,
            decision 9); clients show its Simulated tag.
    """

    __tablename__ = "water_sources"

    name: Mapped[str] = mapped_column(String(SOURCE_NAME_MAX_LENGTH))
    approximate_location: Mapped[str] = mapped_column(String(APPROXIMATE_LOCATION_MAX_LENGTH))
    is_simulated: Mapped[bool] = mapped_column(default=False, server_default=false())


class WaterCategory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A water category the app offers (FR-014).

    Attributes:
        code: Stable code: ``potable`` or ``utility``. Unique. Used by the
            command-line tool; clients use ``id`` and ``label``.
        label: Admin-configured label, e.g. "Potable Water". Never a
            description of the water itself.
        supported_uses: Admin-configured description of what the water may
            be used for, or null until it is written.
        is_active: Whether the category is offered at all. A category is
            also only usable while a source is eligible for it (FR-014).
    """

    __tablename__ = "water_categories"

    code: Mapped[str] = mapped_column(String(CATEGORY_CODE_MAX_LENGTH), unique=True)
    label: Mapped[str] = mapped_column(String(CATEGORY_LABEL_MAX_LENGTH))
    supported_uses: Mapped[str | None] = mapped_column(String(SUPPORTED_USES_MAX_LENGTH))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())


class ActivationStatus(StrEnum):
    """State of a source's activation for one category (FR-012, BR-10).

    - ``activated``: approved for the category after laboratory
      verification; usable while ``approved_until`` has not passed.
    - ``suspended``: stopped after a safety concern (BR-10); may be
      activated again.
    - ``revoked``: withdrawn.
    """

    ACTIVATED = "activated"
    SUSPENDED = "suspended"
    REVOKED = "revoked"


class WaterSourceCategory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One source's activation for one water category (the FR-012 gate).

    Attributes:
        source_id: The water source.
        water_category_id: The category.
        status: :class:`ActivationStatus`.
        approved_until: Last Lagos date the laboratory approval is valid
            (inclusive). From the next day the source is
            ``approval_expired`` for this category (T-04).
        report_reference: Reference of the laboratory report kept outside the
            app, e.g. "LR-0001" (F1). Never a document or link.
        cost_per_litre_minor_units: The supplier's cost per litre in kobo
            (FR-011, SRS §5). Used for pricing later; **never** sent to a
            client.
        status_reason: Why the activation was suspended or revoked. Required
            for those statuses, null when activated.
    """

    __tablename__ = "water_source_categories"
    __table_args__ = (
        UniqueConstraint("source_id", "water_category_id"),
        CheckConstraint("cost_per_litre_minor_units >= 0", name="cost_not_negative"),
        CheckConstraint(
            "(status = 'activated') = (status_reason IS NULL)",
            name="reason_only_when_not_activated",
        ),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("water_sources.id", ondelete="RESTRICT"), index=True
    )
    water_category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("water_categories.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[ActivationStatus] = mapped_column(
        Enum(
            ActivationStatus,
            name="activation_status",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda members: [member.value for member in members],
        )
    )
    approved_until: Mapped[date]
    report_reference: Mapped[str] = mapped_column(String(REPORT_REFERENCE_MAX_LENGTH))
    cost_per_litre_minor_units: Mapped[int] = mapped_column(BigInteger)
    status_reason: Mapped[str | None] = mapped_column(String(STATUS_REASON_MAX_LENGTH))
