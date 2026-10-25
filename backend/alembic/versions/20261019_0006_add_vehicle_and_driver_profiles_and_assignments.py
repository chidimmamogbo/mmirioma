"""Add vehicle profiles, driver profiles and assignments (S1-07).

docs/api/deliveries.md and docs/features/driver-assignment.md:

- ``vehicle_profiles``: vehicle type and verified safe payload in litres
  (FR-013), 1-100000 by CHECK.
- ``driver_profiles``: one per driver account, with its vehicle and
  availability (FR-031).
- ``assignments``: offers of orders to drivers (FR-031, FR-032). Two partial
  unique indexes allow at most one live (``offered``/``accepted``)
  assignment per order and per driver, so concurrent requests cannot
  overcommit a driver or double-assign an order.
- ``assignments.status`` is VARCHAR plus a named CHECK (as order statuses).
  Autogenerate emitted the CHECK twice; only the ``ck_*`` copy is kept
  (LOG.md, 2026-10-14).
- Foreign keys are RESTRICT: assignments are business records.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-19 14:00:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copy of AssignmentStatus at this revision.
ASSIGNMENT_STATUSES = ("offered", "accepted", "declined", "expired", "withdrawn", "completed")
_STATUS_LIST = ", ".join(f"'{status}'" for status in ASSIGNMENT_STATUSES)
_LIVE = sa.text("status IN ('offered', 'accepted')")


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
        "vehicle_profiles",
        sa.Column("vehicle_type", sa.String(length=50), nullable=False),
        sa.Column("safe_payload_litres", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "safe_payload_litres BETWEEN 1 AND 100000",
            name=op.f("ck_vehicle_profiles_safe_payload_litres_range"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_profiles")),
    )
    op.create_table(
        "driver_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_profile_id", sa.Uuid(), nullable=False),
        sa.Column("is_available", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_driver_profiles_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["vehicle_profile_id"],
            ["vehicle_profiles.id"],
            name=op.f("fk_driver_profiles_vehicle_profile_id_vehicle_profiles"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_driver_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_driver_profiles_user_id")),
    )
    op.create_index(
        op.f("ix_driver_profiles_vehicle_profile_id"),
        "driver_profiles",
        ["vehicle_profile_id"],
        unique=False,
    )
    op.create_table(
        "assignments",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("driver_user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("offered_by", sa.Uuid(), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            f"status IN ({_STATUS_LIST})", name=op.f("ck_assignments_assignment_status")
        ),
        sa.ForeignKeyConstraint(
            ["driver_user_id"],
            ["users.id"],
            name=op.f("fk_assignments_driver_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["offered_by"],
            ["users.id"],
            name=op.f("fk_assignments_offered_by_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_assignments_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assignments")),
    )
    op.create_index(op.f("ix_assignments_driver_user_id"), "assignments", ["driver_user_id"])
    op.create_index(op.f("ix_assignments_order_id"), "assignments", ["order_id"])
    op.create_index(
        "uq_assignments_live_driver",
        "assignments",
        ["driver_user_id"],
        unique=True,
        postgresql_where=_LIVE,
    )
    op.create_index(
        "uq_assignments_live_order",
        "assignments",
        ["order_id"],
        unique=True,
        postgresql_where=_LIVE,
    )


def downgrade() -> None:
    op.drop_index("uq_assignments_live_order", table_name="assignments")
    op.drop_index("uq_assignments_live_driver", table_name="assignments")
    op.drop_index(op.f("ix_assignments_order_id"), table_name="assignments")
    op.drop_index(op.f("ix_assignments_driver_user_id"), table_name="assignments")
    op.drop_table("assignments")
    op.drop_index(op.f("ix_driver_profiles_vehicle_profile_id"), table_name="driver_profiles")
    op.drop_table("driver_profiles")
    op.drop_table("vehicle_profiles")
