"""Add saved customer addresses (#82, part 1).

Implements the ``customer_addresses`` table that docs/api/customer-account.md
(agreed 2026-10-27, #48) and docs/api/admin-directory.md ("Data needed",
#45) share. See docs/features/customer-account.md.

- ``customer_id`` → ``users`` and ``zone_id`` → ``service_zones``, both
  RESTRICT and indexed. The privacy tool removes a customer's addresses
  before it deletes or anonymizes the account.
- ``uq_customer_addresses_one_default``: a partial unique index on
  ``customer_id`` where ``is_default``, so a customer can never have two
  default addresses, even under concurrent requests.
- Lengths follow the contract: label 50, address 500, landmark 200 (the
  same limits as orders).

New table only: no existing data is touched, and the downgrade drops it.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-27 10:33:34.762449+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | Sequence[str] | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "customer_addresses",
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("zone_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=50), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=False),
        sa.Column("landmark", sa.String(length=200), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["users.id"],
            name=op.f("fk_customer_addresses_customer_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["service_zones.id"],
            name=op.f("fk_customer_addresses_zone_id_service_zones"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_addresses")),
    )
    op.create_index(
        op.f("ix_customer_addresses_customer_id"), "customer_addresses", ["customer_id"]
    )
    op.create_index(op.f("ix_customer_addresses_zone_id"), "customer_addresses", ["zone_id"])
    op.create_index(
        "uq_customer_addresses_one_default",
        "customer_addresses",
        ["customer_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )


def downgrade() -> None:
    op.drop_index("uq_customer_addresses_one_default", table_name="customer_addresses")
    op.drop_index(op.f("ix_customer_addresses_zone_id"), table_name="customer_addresses")
    op.drop_index(op.f("ix_customer_addresses_customer_id"), table_name="customer_addresses")
    op.drop_table("customer_addresses")
