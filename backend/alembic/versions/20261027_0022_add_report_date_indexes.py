"""Add indexes for the admin dashboard and report date filters (#102).

docs/api/admin-operations.md, "Data needed": "Indexes for the date ranges
... are checked in the build". ``orders`` already has
``(status, created_at)``; these three filters had none (technical lead,
2026-10-27, #102: add them now):

- ``ix_cash_collections_collected_at``: cash collected on a date or range.
- ``ix_order_events_to_status_created_at``: deliveries by the time of their
  ``delivered`` event.
- ``ix_pickup_records_picked_up_at``: pickups per source over a range.

Indexes only: no data is changed, and the downgrade drops them.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-27 19:30:00+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0022"
down_revision: str | Sequence[str] | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the three indexes."""
    op.create_index(
        "ix_cash_collections_collected_at", "cash_collections", ["collected_at"], unique=False
    )
    op.create_index(
        "ix_order_events_to_status_created_at",
        "order_events",
        ["to_status", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_pickup_records_picked_up_at", "pickup_records", ["picked_up_at"], unique=False
    )


def downgrade() -> None:
    """Drop the three indexes."""
    op.drop_index("ix_pickup_records_picked_up_at", table_name="pickup_records")
    op.drop_index("ix_order_events_to_status_created_at", table_name="order_events")
    op.drop_index("ix_cash_collections_collected_at", table_name="cash_collections")
