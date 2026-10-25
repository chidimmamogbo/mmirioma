"""Add water categories and source activations (order confirmation, #112).

Implements part of "Data needed" in docs/api/deliveries.md, "Order
confirmation endpoints" (agreed 2026-10-22, PR #111). See
docs/features/water-sources.md.

- ``water_categories`` (FR-014): ``code``, ``label``, ``supported_uses``,
  ``is_active``. Seeded with Potable Water (``potable``) and Utility Water
  (``utility``); labels can be changed later without touching orders.
- ``water_source_categories`` (FR-012, BR-10): one activation per source and
  category, with ``status`` (``activated``, ``suspended``, ``revoked``),
  ``approved_until`` (Lagos date, inclusive), ``report_reference``,
  ``cost_per_litre_minor_units`` (BigInteger kobo) and ``status_reason``
  (required unless activated). Unique per source and category.
- ``orders.water_category_id`` (nullable): set at confirmation (#113).

Enumerations are VARCHAR plus one named CHECK, written by hand:
autogenerate does not compare CHECK constraints and duplicates them for
``Enum(create_constraint=True)`` (LOG.md, 2026-10-20).

Downgrade drops the activations, the orders column and the categories; any
activation, category label edit or order category recorded since is lost.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-22 12:00:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | Sequence[str] | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code that
# may change later.
ACTIVATION_STATUSES = ("activated", "suspended", "revoked")
CATEGORIES = (("potable", "Potable Water"), ("utility", "Utility Water"))


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
        "water_categories",
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("label", sa.String(length=60), nullable=False),
        sa.Column("supported_uses", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_water_categories")),
        sa.UniqueConstraint("code", name=op.f("uq_water_categories_code")),
    )
    # gen_random_uuid() is built into PostgreSQL 13+; the app creates ids in
    # Python, which a migration cannot do for server-side rows.
    for code, label in CATEGORIES:
        op.execute(
            sa.text(
                "INSERT INTO water_categories (id, code, label) "
                "VALUES (gen_random_uuid(), :code, :label)"
            ).bindparams(code=code, label=label)
        )

    op.create_table(
        "water_source_categories",
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("water_category_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("approved_until", sa.Date(), nullable=False),
        sa.Column("report_reference", sa.String(length=100), nullable=False),
        sa.Column("cost_per_litre_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("status_reason", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            f"status IN ({_in_list(ACTIVATION_STATUSES)})",
            name=op.f("ck_water_source_categories_activation_status"),
        ),
        sa.CheckConstraint(
            "cost_per_litre_minor_units >= 0",
            name=op.f("ck_water_source_categories_cost_not_negative"),
        ),
        sa.CheckConstraint(
            "(status = 'activated') = (status_reason IS NULL)",
            name=op.f("ck_water_source_categories_reason_only_when_not_activated"),
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["water_sources.id"],
            name=op.f("fk_water_source_categories_source_id_water_sources"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["water_category_id"],
            ["water_categories.id"],
            name=op.f("fk_water_source_categories_water_category_id_water_categories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_water_source_categories")),
        sa.UniqueConstraint(
            "source_id",
            "water_category_id",
            name=op.f("uq_water_source_categories_source_id"),
        ),
    )
    op.create_index(
        op.f("ix_water_source_categories_source_id"),
        "water_source_categories",
        ["source_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_water_source_categories_water_category_id"),
        "water_source_categories",
        ["water_category_id"],
        unique=False,
    )

    op.add_column("orders", sa.Column("water_category_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_orders_water_category_id_water_categories"),
        "orders",
        "water_categories",
        ["water_category_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_orders_water_category_id"), "orders", ["water_category_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_orders_water_category_id"), table_name="orders")
    op.drop_constraint(
        op.f("fk_orders_water_category_id_water_categories"), "orders", type_="foreignkey"
    )
    op.drop_column("orders", "water_category_id")
    op.drop_index(
        op.f("ix_water_source_categories_water_category_id"),
        table_name="water_source_categories",
    )
    op.drop_index(
        op.f("ix_water_source_categories_source_id"), table_name="water_source_categories"
    )
    op.drop_table("water_source_categories")
    op.drop_table("water_categories")
