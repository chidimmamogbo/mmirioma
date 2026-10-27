"""Add order feedback (#82, part 3).

Implements the ``feedback`` table (SRS §5) for ``PUT /orders/{reference}/feedback``
in docs/api/customer-account.md (agreed 2026-10-27, #48). See
docs/features/customer-account.md.

- ``order_id`` → ``orders``, unique: one feedback per order, so submitting
  again replaces it (FR-051 duplicate protection). CASCADE: feedback goes
  with its order; only simulated and test orders are ever deleted.
- ``rating`` SMALLINT with ``ck_feedback_rating_range`` (1-5).
- ``poured_by_partner`` required; ``on_time``, ``quantity_as_ordered`` and
  ``would_reorder`` nullable (contract decision 7); ``message`` up to 500.

New table only: no existing data is touched, and the downgrade drops it.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-27 12:10:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | Sequence[str] | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("poured_by_partner", sa.Boolean(), nullable=False),
        sa.Column("on_time", sa.Boolean(), nullable=True),
        sa.Column("quantity_as_ordered", sa.Boolean(), nullable=True),
        sa.Column("would_reorder", sa.Boolean(), nullable=True),
        sa.Column("message", sa.String(length=500), nullable=True),
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
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name=op.f("ck_feedback_rating_range")),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_feedback_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_feedback")),
        sa.UniqueConstraint("order_id", name=op.f("uq_feedback_order_id")),
    )


def downgrade() -> None:
    op.drop_table("feedback")
