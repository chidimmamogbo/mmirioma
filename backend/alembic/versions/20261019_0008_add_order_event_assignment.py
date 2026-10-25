"""Link order events to the assignment they were about.

For the admin dispatch history (docs/api/deliveries.md, "Admin dispatch
endpoints", agreed in G3, PR #59; issue #61). ``order_events.assignment_id``
is set by the dispatch services on the events of rows 8-11 (offered,
accepted, declined, withdrawn), so the history can name the driver and the
decline reason. Every other event leaves it null.

- Nullable, no backfill: events written before this revision stay null, and
  the history returns ``assignment: null`` for them (contract, "Data
  needed"). Inferring the link from timestamps would be a guess.
- RESTRICT, like every business foreign key: an assignment with events
  cannot be deleted. Test clean-up deletes ``order_events`` before
  ``assignments``.
- Indexed, as foreign keys are in this schema.

Downgrade drops the column; the links are lost, the events stay.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-19 20:00:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("order_events", sa.Column("assignment_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_order_events_assignment_id_assignments"),
        "order_events",
        "assignments",
        ["assignment_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_order_events_assignment_id"), "order_events", ["assignment_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_order_events_assignment_id"), table_name="order_events")
    op.drop_constraint(
        op.f("fk_order_events_assignment_id_assignments"), "order_events", type_="foreignkey"
    )
    op.drop_column("order_events", "assignment_id")
