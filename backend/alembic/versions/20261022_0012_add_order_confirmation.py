"""Add order confirmation: price snapshots, SMS outcome, ``manual_quote`` (#113).

Implements the rest of "Data needed" in docs/api/deliveries.md, "Order
confirmation endpoints" (agreed 2026-10-22, PR #111); #112 (revision 0011)
built the source records and ``orders.water_category_id``. See
docs/features/order-confirmation.md.

- ``order_price_snapshots`` (FR-024): one per confirmed order, linked to the
  row 7 event; the total in kobo (whole naira, at least 100; CHECK), ``NGN``,
  ``is_manual``, the category and its label at confirmation, the source and
  window confirmed, who entered it and when, and how and when the customer
  agreed. All foreign keys RESTRICT.
- ``orders.confirmation_sms_status`` (``accepted``/``not_accepted``) and
  ``confirmation_sms_attempted_at`` (FR-050).
- ``order_events.reason_code`` gains ``manual_quote`` (row 26). Alembic does
  not compare CHECK constraints, so the list is replaced by hand (LOG.md,
  2026-10-20).

Downgrade drops the snapshots and the SMS columns (their data is lost) and
restores the old reason list. It fails, by design, while any event has
``manual_quote``: PostgreSQL refuses the narrower CHECK, so confirmed orders
are never left with a reason the schema does not allow. Remove or migrate
those events with a reviewed plan first.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-22 15:00:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | Sequence[str] | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code.
OLD_REASONS = (
    "driver_declined",
    "reassigned",
    "assignment_expired",
    "recorded_for_driver",
    "customer_unreachable",
    "unsafe_access",
    "vehicle_failure",
    "source_quality_concern",
    "rescheduled",
    "customer_request",
    "mmirioma_unable",
    "missing_quantity",
    "water_quality",
    "handling",
    "dispute_resolved",
    "other",
)
NEW_REASONS = (*OLD_REASONS, "manual_quote")
SMS_STATUSES = ("accepted", "not_accepted")
AGREEMENT_METHODS = ("phone_call", "in_person_to_staff", "other")
REASON_CHECK = "ck_order_events_transition_reason"


def _in_list(values: Sequence[str]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def _replace_reason_check(reasons: Sequence[str]) -> None:
    op.drop_constraint(op.f(REASON_CHECK), "order_events", type_="check")
    op.create_check_constraint(
        op.f(REASON_CHECK), "order_events", f"reason_code IN ({_in_list(reasons)})"
    )


def upgrade() -> None:
    _replace_reason_check(NEW_REASONS)

    op.add_column(
        "orders", sa.Column("confirmation_sms_status", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "orders",
        sa.Column("confirmation_sms_attempted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_orders_confirmation_sms_status"),
        "orders",
        f"confirmation_sms_status IN ({_in_list(SMS_STATUSES)})",
    )

    op.create_table(
        "order_price_snapshots",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("total_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="NGN", nullable=False),
        sa.Column("is_manual", sa.Boolean(), nullable=False),
        sa.Column("water_category_id", sa.Uuid(), nullable=False),
        sa.Column("water_category_label", sa.String(length=60), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("delivery_window_start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivery_window_end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("entered_by", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("customer_agreement_method", sa.String(length=20), nullable=False),
        sa.Column("customer_agreed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "total_minor_units >= 100 AND total_minor_units % 100 = 0",
            name=op.f("ck_order_price_snapshots_total_whole_naira"),
        ),
        sa.CheckConstraint("currency = 'NGN'", name=op.f("ck_order_price_snapshots_currency_ngn")),
        sa.CheckConstraint(
            "delivery_window_end_at > delivery_window_start_at",
            name=op.f("ck_order_price_snapshots_window_end_after_start"),
        ),
        sa.CheckConstraint(
            f"customer_agreement_method IN ({_in_list(AGREEMENT_METHODS)})",
            name=op.f("ck_order_price_snapshots_agreement_method"),
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_price_snapshots_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["order_events.id"],
            name=op.f("fk_order_price_snapshots_event_id_order_events"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["water_category_id"],
            ["water_categories.id"],
            name=op.f("fk_order_price_snapshots_water_category_id_water_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["water_sources.id"],
            name=op.f("fk_order_price_snapshots_source_id_water_sources"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["entered_by"],
            ["users.id"],
            name=op.f("fk_order_price_snapshots_entered_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_price_snapshots")),
        sa.UniqueConstraint("order_id", name=op.f("uq_order_price_snapshots_order_id")),
        sa.UniqueConstraint("event_id", name=op.f("uq_order_price_snapshots_event_id")),
    )
    for column in ("water_category_id", "source_id", "entered_by"):
        op.create_index(
            op.f(f"ix_order_price_snapshots_{column}"),
            "order_price_snapshots",
            [column],
            unique=False,
        )


def downgrade() -> None:
    for column in ("water_category_id", "source_id", "entered_by"):
        op.drop_index(
            op.f(f"ix_order_price_snapshots_{column}"), table_name="order_price_snapshots"
        )
    op.drop_table("order_price_snapshots")
    op.drop_constraint(op.f("ck_orders_confirmation_sms_status"), "orders", type_="check")
    op.drop_column("orders", "confirmation_sms_attempted_at")
    op.drop_column("orders", "confirmation_sms_status")
    _replace_reason_check(OLD_REASONS)
