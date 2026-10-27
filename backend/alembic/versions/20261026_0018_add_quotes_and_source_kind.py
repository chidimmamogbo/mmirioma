"""Add server quotes, orders.quote_id and the kind of water sources (#21).

Implements ``POST /quotes`` storage and ``quote_id`` on orders from
docs/api/order-details-and-price.md (agreed 2026-10-26, #42), and point 2 of
"Water source and category". See docs/features/pricing.md.

- ``water_sources.kind`` (``ninth_mile`` or ``borehole``, nullable until the
  technical lead sets it): a Tanker customer's source preference matches it.
- ``quotes``: one row per available quote: the choice that was priced (to
  check that an order matches), the frozen category label, every FR-024
  component in kobo (water, delivery, handling, margin, rounding), the price
  rule and vehicle plan used, and ``price_valid_until``. CHECKs keep the
  total a whole naira equal to the components plus the rounding (0-99 kobo),
  and trips between 1 and 2 (FR-013). All foreign keys RESTRICT.
- ``orders.quote_id`` → ``quotes`` (RESTRICT, nullable, indexed): the quote
  an order was placed with, frozen (FR-024).

Enum columns are VARCHAR plus one named CHECK (the schema's convention).
Autogenerate emitted the ``margin_type`` CHECK twice and no CHECK for the
added ``kind`` column (LOG.md, 2026-10-14 and 2026-10-23), so they are
written by hand here.

Downgrade drops ``orders.quote_id``, the quotes and the source kinds: every
order loses the link to its quote. Run it only on a database without real
quoted orders.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-26 23:30:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | Sequence[str] | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code.
SOURCE_KINDS = ("ninth_mile", "borehole")
MARGIN_TYPES = ("fixed", "percentage")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(f"'{value}'" for value in values)})"


def _fk(column: str, table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column], [f"{table}.id"], name=op.f(f"fk_quotes_{column}_{table}"), ondelete="RESTRICT"
    )


def upgrade() -> None:
    """Add the source kind, the quotes table and orders.quote_id."""
    op.add_column("water_sources", sa.Column("kind", sa.String(length=12), nullable=True))
    op.create_check_constraint(
        op.f("ck_water_sources_water_source_kind"), "water_sources", _in("kind", SOURCE_KINDS)
    )

    op.create_table(
        "quotes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("delivery_type", sa.String(length=10), nullable=False),
        sa.Column("keke_can_size_litres", sa.Integer(), nullable=True),
        sa.Column("keke_can_count", sa.Integer(), nullable=True),
        sa.Column("tanker_tank_type", sa.String(length=10), nullable=True),
        sa.Column("tanker_quantity_local_gallons", sa.Integer(), nullable=True),
        sa.Column("water_source", sa.String(length=12), nullable=True),
        sa.Column("delivery_address", sa.String(length=500), nullable=False),
        sa.Column("service_zone_id", sa.Uuid(), nullable=False),
        sa.Column("quantity_litres", sa.Integer(), nullable=False),
        sa.Column("water_category_id", sa.Uuid(), nullable=False),
        sa.Column("water_category_label", sa.String(length=60), nullable=False),
        sa.Column("cost_per_litre_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("water_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("delivery_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("handling_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("margin_type", sa.String(length=10), nullable=False),
        sa.Column("margin_amount_minor_units", sa.BigInteger(), nullable=True),
        sa.Column("margin_basis_points", sa.Integer(), nullable=True),
        sa.Column("margin_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("rounding_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("total_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("price_list_version_id", sa.Uuid(), nullable=False),
        sa.Column("price_rule_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_profile_id", sa.Uuid(), nullable=False),
        sa.Column("safe_payload_litres", sa.Integer(), nullable=False),
        sa.Column("trips", sa.Integer(), nullable=False),
        sa.Column("price_valid_until", sa.DateTime(timezone=True), nullable=False),
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
            _in("margin_type", MARGIN_TYPES), name=op.f("ck_quotes_quote_margin_type")
        ),
        sa.CheckConstraint(
            "water_minor_units >= 0 AND delivery_minor_units >= 0 AND handling_minor_units >= 0"
            " AND margin_minor_units >= 0 AND cost_per_litre_minor_units >= 0",
            name=op.f("ck_quotes_components_not_negative"),
        ),
        sa.CheckConstraint(
            "rounding_minor_units BETWEEN 0 AND 99", name=op.f("ck_quotes_rounding_range")
        ),
        sa.CheckConstraint(
            "total_minor_units = water_minor_units + delivery_minor_units + handling_minor_units"
            " + margin_minor_units + rounding_minor_units",
            name=op.f("ck_quotes_total_is_sum"),
        ),
        sa.CheckConstraint("total_minor_units % 100 = 0", name=op.f("ck_quotes_total_whole_naira")),
        sa.CheckConstraint("trips BETWEEN 1 AND 2", name=op.f("ck_quotes_trips_range")),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["users.id"],
            name=op.f("fk_quotes_customer_id_users"),
            ondelete="RESTRICT",
        ),
        _fk("service_zone_id", "service_zones"),
        _fk("water_category_id", "water_categories"),
        _fk("price_list_version_id", "price_list_versions"),
        _fk("price_rule_id", "price_rules"),
        _fk("vehicle_profile_id", "vehicle_profiles"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quotes")),
    )
    op.create_index(op.f("ix_quotes_customer_id"), "quotes", ["customer_id"])

    op.add_column("orders", sa.Column("quote_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_orders_quote_id"), "orders", ["quote_id"])
    op.create_foreign_key(
        op.f("fk_orders_quote_id_quotes"),
        "orders",
        "quotes",
        ["quote_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    """Drop orders.quote_id, the quotes table and the source kind."""
    op.drop_constraint(op.f("fk_orders_quote_id_quotes"), "orders", type_="foreignkey")
    op.drop_index(op.f("ix_orders_quote_id"), table_name="orders")
    op.drop_column("orders", "quote_id")
    op.drop_index(op.f("ix_quotes_customer_id"), table_name="quotes")
    op.drop_table("quotes")
    op.drop_constraint(op.f("ck_water_sources_water_source_kind"), "water_sources", type_="check")
    op.drop_column("water_sources", "kind")
