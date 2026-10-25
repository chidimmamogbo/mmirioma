"""Add SRS v0.2 delivery statuses and transition reason codes (S1-06).

docs/api/deliveries.md:

- Order statuses gain ``awaiting_payment``, ``departed``, ``arrived`` and
  ``unloading`` (FR-033). The three status CHECK constraints (``orders`` and
  both ``order_events`` columns) are replaced; autogenerate does not compare
  CHECK constraints, so this was written by hand.
- ``order_events.reason_code`` (VARCHAR plus a named CHECK) records why a
  transition happened, for transitions that require one.
- ``order_events.reason`` (free text, only ever null so far) is renamed to
  ``note`` and limited to 500 characters, matching the contract.

Downgrade restores the old constraints. It fails if any row already uses a
new status, and it drops reason codes and shortens nothing back: notes stay
as text. Run it only before the new statuses are in use.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-19 12:00:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code.
OLD_STATUSES = (
    "quote_requested",
    "awaiting_confirmation",
    "confirmed",
    "assigned",
    "accepted",
    "collected",
    "en_route",
    "delivered",
    "cancelled",
    "failed",
    "disputed",
)
NEW_STATUSES = (
    "quote_requested",
    "awaiting_payment",
    "awaiting_confirmation",
    "confirmed",
    "assigned",
    "accepted",
    "departed",
    "collected",
    "en_route",
    "arrived",
    "unloading",
    "delivered",
    "cancelled",
    "failed",
    "disputed",
)
REASONS = (
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

# (table, constraint name, column) of every status CHECK.
STATUS_CHECKS = (
    ("orders", "ck_orders_order_status", "status"),
    ("order_events", "ck_order_events_order_event_from_status", "from_status"),
    ("order_events", "ck_order_events_order_event_to_status", "to_status"),
)


def _values(values: Sequence[str]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def _replace_status_checks(statuses: Sequence[str]) -> None:
    # op.f(): the names are final; without it the naming convention in
    # app/core/models.py would prefix them a second time (LOG.md, 2026-10-19).
    for table, name, column in STATUS_CHECKS:
        op.drop_constraint(op.f(name), table, type_="check")
        op.create_check_constraint(op.f(name), table, f"{column} IN ({_values(statuses)})")


def upgrade() -> None:
    _replace_status_checks(NEW_STATUSES)
    op.add_column("order_events", sa.Column("reason_code", sa.String(length=40), nullable=True))
    op.create_check_constraint(
        op.f("ck_order_events_transition_reason"),
        "order_events",
        f"reason_code IN ({_values(REASONS)})",
    )
    op.alter_column(
        "order_events",
        "reason",
        new_column_name="note",
        type_=sa.String(length=500),
        existing_type=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "order_events",
        "note",
        new_column_name="reason",
        type_=sa.Text(),
        existing_type=sa.String(length=500),
        existing_nullable=True,
    )
    op.drop_constraint(op.f("ck_order_events_transition_reason"), "order_events", type_="check")
    op.drop_column("order_events", "reason_code")
    _replace_status_checks(OLD_STATUSES)
