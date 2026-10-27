"""Add support requests and deletion requests (#82, part 4).

Implements the ``support_requests`` and ``deletion_requests`` tables from
docs/api/customer-account.md ("Data needed", agreed 2026-10-27, #48), with
the ``resolution_note`` the admin endpoints in docs/api/admin-operations.md
need (#22). See docs/features/customer-account.md.

- ``support_requests``: ``reference`` unique (``SR-``), the customer and
  the order (both RESTRICT, indexed), ``type`` and ``status`` (VARCHAR plus
  one named CHECK each), ``message`` up to 1000, ``idempotency_key`` unique
  per customer, ``resolved_at``, ``resolved_by`` (RESTRICT),
  ``resolution_note`` up to 500.
- ``deletion_requests``: ``reference`` unique (``DR-``), the customer
  (RESTRICT, indexed), ``reason``, ``status`` (CHECK), ``acknowledge_by``
  (date), the time of each status, ``refusal_reason`` (contract decision 10:
  "refused with a reason") and ``handled_by`` (RESTRICT).
  ``uq_deletion_requests_one_open``: at most one ``received`` or
  ``acknowledged`` request per customer, even under concurrent requests.

Enum columns are VARCHAR plus one named CHECK (the schema's convention).
Autogenerate emitted every CHECK twice (LOG.md, 2026-10-14), so they are
written by hand here.

New tables only: no existing data is touched, and the downgrade drops them.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-27 13:40:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | Sequence[str] | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code.
SUPPORT_TYPES = ("late", "wrong_quantity", "payment", "rider", "other")
SUPPORT_STATUSES = ("open", "resolved")
DELETION_STATUSES = ("received", "acknowledged", "completed", "refused")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(f"'{value}'" for value in values)})"


def _timestamps() -> list[sa.Column[object]]:
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


def _fk(table: str, column: str, referred: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column],
        [f"{referred}.id"],
        name=op.f(f"fk_{table}_{column}_{referred}"),
        ondelete="RESTRICT",
    )


def upgrade() -> None:
    op.create_table(
        "deletion_requests",
        sa.Column("reference", sa.String(length=11), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=15), nullable=False),
        sa.Column("acknowledge_by", sa.Date(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refusal_reason", sa.String(length=500), nullable=True),
        sa.Column("handled_by", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            _in("status", DELETION_STATUSES),
            name=op.f("ck_deletion_requests_deletion_request_status"),
        ),
        _fk("deletion_requests", "handled_by", "users"),
        _fk("deletion_requests", "user_id", "users"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deletion_requests")),
        sa.UniqueConstraint("reference", name=op.f("uq_deletion_requests_reference")),
    )
    op.create_index(op.f("ix_deletion_requests_user_id"), "deletion_requests", ["user_id"])
    op.create_index(
        "uq_deletion_requests_one_open",
        "deletion_requests",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('received', 'acknowledged')"),
    )

    op.create_table(
        "support_requests",
        sa.Column("reference", sa.String(length=11), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("message", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.Uuid(), nullable=True),
        sa.Column("resolution_note", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            _in("status", SUPPORT_STATUSES),
            name=op.f("ck_support_requests_support_request_status"),
        ),
        sa.CheckConstraint(
            _in("type", SUPPORT_TYPES), name=op.f("ck_support_requests_support_request_type")
        ),
        _fk("support_requests", "order_id", "orders"),
        _fk("support_requests", "resolved_by", "users"),
        _fk("support_requests", "user_id", "users"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_support_requests")),
        sa.UniqueConstraint("reference", name=op.f("uq_support_requests_reference")),
        sa.UniqueConstraint("user_id", "idempotency_key", name=op.f("uq_support_requests_user_id")),
    )
    op.create_index(op.f("ix_support_requests_order_id"), "support_requests", ["order_id"])
    op.create_index(op.f("ix_support_requests_user_id"), "support_requests", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_support_requests_user_id"), table_name="support_requests")
    op.drop_index(op.f("ix_support_requests_order_id"), table_name="support_requests")
    op.drop_table("support_requests")
    op.drop_index("uq_deletion_requests_one_open", table_name="deletion_requests")
    op.drop_index(op.f("ix_deletion_requests_user_id"), table_name="deletion_requests")
    op.drop_table("deletion_requests")
