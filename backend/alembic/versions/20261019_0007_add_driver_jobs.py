"""Add driver jobs: sources, decline reasons, pickups, delivery codes, exceptions.

Implements the persistence for the driver job endpoints in
docs/api/deliveries.md (agreed 2026-10-19). See docs/features/driver-jobs.md.
The new order statuses came in revision ``0005``; ``assignments`` (the
driver's jobs) in ``0006`` (dispatch).

- ``water_sources``: only name and approximate location so far (FR-011);
  the rest of FR-011 comes with admin source management.
- ``orders`` gains ``source_id`` and the confirmed delivery window
  (``delivery_window_start_at``/``end_at``), which stands in for delivery
  slots until service zones are decided (SRS §12.2; team decision
  2026-10-19). ``ck_orders_delivery_window_valid`` keeps both set or both
  null, end after start.
- ``assignments`` gains ``decline_reason`` (CHECK
  ``ck_assignments_decline_reason``) and ``decline_note``, both nullable, for
  the driver app's decline (design J2-b).
- ``pickup_records``: one per assignment (unique); exactly one of
  ``source_id`` and ``other_source_name`` (``ck_pickup_records_one_source``).
- ``delivery_codes``: HMAC hashes only; attempts limited to 0-5 (FR-035).
- ``order_exceptions``: incidents and holds (FR-036).
- Enumerations are VARCHAR plus a named CHECK (as ``orders.status``).
  All foreign keys are RESTRICT: these are business records.

Downgrade drops the new tables and columns; their data is lost.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-19 13:00:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies of the enumerations at this revision. Migrations must not
# import app code that may change later.
DECLINE_REASONS = ("not_available", "vehicle_cannot_carry", "too_far", "unsafe_access", "other")
SMS_STATUSES = ("accepted", "failed")
EXCEPTION_CATEGORIES = (
    "running_late",
    "unsafe_access",
    "unsafe_transfer",
    "volume_issue",
    "source_concern",
    "vehicle_problem",
    "other",
    "source_mismatch",
    "pickup_safety_concern",
    "partial_pickup",
)
HOLD_KINDS = ("source_review", "unsafe_stop", "proof_review")


def _in_list(values: Sequence[str]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def _timestamps() -> list[sa.Column]:
    return [
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
    ]


def upgrade() -> None:
    op.create_table(
        "water_sources",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("approximate_location", sa.String(length=200), nullable=False),
        sa.Column("is_simulated", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_water_sources")),
    )

    op.add_column("orders", sa.Column("source_id", sa.Uuid(), nullable=True))
    op.add_column(
        "orders",
        sa.Column("delivery_window_start_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "orders", sa.Column("delivery_window_end_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        op.f("fk_orders_source_id_water_sources"),
        "orders",
        "water_sources",
        ["source_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(op.f("ix_orders_source_id"), "orders", ["source_id"], unique=False)
    op.create_check_constraint(
        op.f("ck_orders_delivery_window_valid"),
        "orders",
        "(delivery_window_start_at IS NULL AND delivery_window_end_at IS NULL) OR "
        "(delivery_window_start_at IS NOT NULL AND delivery_window_end_at IS NOT NULL "
        "AND delivery_window_end_at > delivery_window_start_at)",
    )

    op.add_column("assignments", sa.Column("decline_reason", sa.String(length=30), nullable=True))
    op.add_column("assignments", sa.Column("decline_note", sa.String(length=300), nullable=True))
    op.create_check_constraint(
        op.f("ck_assignments_decline_reason"),
        "assignments",
        f"decline_reason IN ({_in_list(DECLINE_REASONS)})",
    )

    op.create_table(
        "pickup_records",
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("other_source_name", sa.String(length=120), nullable=True),
        sa.Column("source_reference", sa.String(length=100), nullable=True),
        sa.Column("volume_collected_litres", sa.Integer(), nullable=False),
        sa.Column("picked_up_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("safety_concern", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("safety_note", sa.String(length=500), nullable=True),
        sa.Column("recorded_by", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "volume_collected_litres > 0", name=op.f("ck_pickup_records_volume_positive")
        ),
        sa.CheckConstraint(
            "(source_id IS NULL) <> (other_source_name IS NULL)",
            name=op.f("ck_pickup_records_one_source"),
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["assignments.id"],
            name=op.f("fk_pickup_records_assignment_id_assignments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_pickup_records_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["water_sources.id"],
            name=op.f("fk_pickup_records_source_id_water_sources"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by"],
            ["users.id"],
            name=op.f("fk_pickup_records_recorded_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pickup_records")),
        sa.UniqueConstraint("assignment_id", name=op.f("uq_pickup_records_assignment_id")),
    )
    op.create_index(
        op.f("ix_pickup_records_order_id"), "pickup_records", ["order_id"], unique=False
    )

    op.create_table(
        "delivery_codes",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sms_status", sa.String(length=10), nullable=False),
        sa.Column("issued_by", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "attempts BETWEEN 0 AND 5", name=op.f("ck_delivery_codes_attempts_range")
        ),
        sa.CheckConstraint(
            f"sms_status IN ({_in_list(SMS_STATUSES)})",
            name=op.f("ck_delivery_codes_sms_status"),
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_delivery_codes_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["issued_by"],
            ["users.id"],
            name=op.f("fk_delivery_codes_issued_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_codes")),
    )
    op.create_index(
        "ix_delivery_codes_order_id_issued_at",
        "delivery_codes",
        ["order_id", "issued_at"],
        unique=False,
    )

    op.create_table(
        "order_exceptions",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("assignment_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("new_estimated_arrival_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hold_kind", sa.String(length=20), nullable=True),
        sa.Column("requires_admin_review", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reported_by", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            f"category IN ({_in_list(EXCEPTION_CATEGORIES)})",
            name=op.f("ck_order_exceptions_exception_category"),
        ),
        sa.CheckConstraint(
            f"hold_kind IN ({_in_list(HOLD_KINDS)})",
            name=op.f("ck_order_exceptions_hold_kind"),
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_exceptions_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["assignments.id"],
            name=op.f("fk_order_exceptions_assignment_id_assignments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reported_by"],
            ["users.id"],
            name=op.f("fk_order_exceptions_reported_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_exceptions")),
    )
    op.create_index(
        op.f("ix_order_exceptions_assignment_id"),
        "order_exceptions",
        ["assignment_id"],
        unique=False,
    )
    op.create_index(
        "ix_order_exceptions_order_id_created_at",
        "order_exceptions",
        ["order_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_order_exceptions_order_id_created_at", table_name="order_exceptions")
    op.drop_index(op.f("ix_order_exceptions_assignment_id"), table_name="order_exceptions")
    op.drop_table("order_exceptions")
    op.drop_index("ix_delivery_codes_order_id_issued_at", table_name="delivery_codes")
    op.drop_table("delivery_codes")
    op.drop_index(op.f("ix_pickup_records_order_id"), table_name="pickup_records")
    op.drop_table("pickup_records")
    op.drop_constraint(op.f("ck_assignments_decline_reason"), "assignments", type_="check")
    op.drop_column("assignments", "decline_note")
    op.drop_column("assignments", "decline_reason")

    op.drop_constraint(op.f("ck_orders_delivery_window_valid"), "orders", type_="check")
    op.drop_index(op.f("ix_orders_source_id"), table_name="orders")
    op.drop_constraint(op.f("fk_orders_source_id_water_sources"), "orders", type_="foreignkey")
    op.drop_column("orders", "delivery_window_end_at")
    op.drop_column("orders", "delivery_window_start_at")
    op.drop_column("orders", "source_id")
    op.drop_table("water_sources")
