"""Add order delivery details and the picked service zone (#21).

Implements "Delivery details" and ``service_zone_id`` of
docs/api/order-details-and-price.md (agreed 2026-10-26, #42). See
docs/features/orders.md.

``orders`` gains, all nullable (orders created before #21 have none):

- ``delivery_type`` (``keke`` or ``tanker``);
- Keke: ``keke_can_size_litres`` (25 or 50) and ``keke_can_count``;
- Tanker: ``tanker_tank_type`` (``ground`` or ``overhead``),
  ``tanker_quantity_local_gallons`` and ``water_source`` (``ninth_mile`` or
  ``borehole``, a preference);
- ``service_zone_id`` → ``service_zones`` (RESTRICT), indexed.

CHECK ``ck_orders_delivery_details_shape`` allows exactly three shapes: no
details (older orders), Keke details with ``quantity_litres`` = size x count,
or Tanker details with ``quantity_litres`` = gallons x 4 and a source
preference (FR-021). Existing rows have no details, so they satisfy it.

Enum columns are VARCHAR plus one named CHECK (the schema's convention).
Autogenerate does not emit CHECKs for added columns or compare table CHECKs,
so they are written by hand here (LOG.md, 2026-10-23).

Downgrade drops the seven columns and their CHECKs: the details of every
order placed in the new shape are lost (``quantity_litres`` stays). Run it
only on a database without real orders in the new shape.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-26 22:30:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | Sequence[str] | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code.
DELIVERY_TYPES = ("keke", "tanker")
TANK_TYPES = ("ground", "overhead")
WATER_SOURCES = ("ninth_mile", "borehole")

SHAPE = (
    "(delivery_type IS NULL AND keke_can_size_litres IS NULL AND keke_can_count IS NULL"
    " AND tanker_tank_type IS NULL AND tanker_quantity_local_gallons IS NULL"
    " AND water_source IS NULL)"
    " OR (delivery_type = 'keke' AND keke_can_size_litres IN (25, 50)"
    " AND keke_can_count >= 1 AND quantity_litres = keke_can_size_litres * keke_can_count"
    " AND tanker_tank_type IS NULL AND tanker_quantity_local_gallons IS NULL"
    " AND water_source IS NULL)"
    " OR (delivery_type = 'tanker' AND tanker_tank_type IS NOT NULL"
    " AND tanker_quantity_local_gallons >= 1"
    " AND quantity_litres = tanker_quantity_local_gallons * 4 AND water_source IS NOT NULL"
    " AND keke_can_size_litres IS NULL AND keke_can_count IS NULL)"
)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(f"'{value}'" for value in values)})"


def upgrade() -> None:
    """Add the detail columns, the zone foreign key and the CHECKs."""
    op.add_column("orders", sa.Column("delivery_type", sa.String(length=10), nullable=True))
    op.add_column("orders", sa.Column("keke_can_size_litres", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("keke_can_count", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("tanker_tank_type", sa.String(length=10), nullable=True))
    op.add_column("orders", sa.Column("tanker_quantity_local_gallons", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("water_source", sa.String(length=12), nullable=True))
    op.add_column("orders", sa.Column("service_zone_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_orders_service_zone_id"), "orders", ["service_zone_id"])
    op.create_foreign_key(
        op.f("fk_orders_service_zone_id_service_zones"),
        "orders",
        "service_zones",
        ["service_zone_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_orders_delivery_type"), "orders", _in("delivery_type", DELIVERY_TYPES)
    )
    op.create_check_constraint(
        op.f("ck_orders_tanker_tank_type"), "orders", _in("tanker_tank_type", TANK_TYPES)
    )
    op.create_check_constraint(
        op.f("ck_orders_water_source"), "orders", _in("water_source", WATER_SOURCES)
    )
    op.create_check_constraint(op.f("ck_orders_delivery_details_shape"), "orders", SHAPE)


def downgrade() -> None:
    """Drop the CHECKs, the zone foreign key and the seven columns."""
    for name in (
        "ck_orders_delivery_details_shape",
        "ck_orders_water_source",
        "ck_orders_tanker_tank_type",
        "ck_orders_delivery_type",
    ):
        op.drop_constraint(op.f(name), "orders", type_="check")
    op.drop_constraint(
        op.f("fk_orders_service_zone_id_service_zones"), "orders", type_="foreignkey"
    )
    op.drop_index(op.f("ix_orders_service_zone_id"), table_name="orders")
    for column in (
        "service_zone_id",
        "water_source",
        "tanker_quantity_local_gallons",
        "tanker_tank_type",
        "keke_can_count",
        "keke_can_size_litres",
        "delivery_type",
    ):
        op.drop_column("orders", column)
