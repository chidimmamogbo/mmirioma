"""Add service zones and their delivery fees (#30).

Implements the service zones section of docs/api/admin-directory.md (agreed
2026-10-26, PR #38, with PR #41). See docs/features/service-zones.md.

- ``service_zones``: name, active flag, required ``centre`` point and
  optional ``boundary`` polygon (FR-010). Names are unique ignoring case
  through the expression index ``uq_service_zones_name_lower`` on
  ``lower(name)``. Zones are never deleted (switched off instead).
- ``service_zone_delivery_fees``: one fee per zone and water category, per
  order (contract open question 13), integer kobo, 0 or more (CHECK). It is
  the FR-022 fallback delivery cost while there is no road distance.
- Spatial columns are PostGIS ``geography`` in SRID 4326 via GeoAlchemy2
  (approved 2026-10-20, as in ``0009``), with no spatial index: nothing
  searches zones by location. Autogenerate emitted
  ``create_geospatial_table``; plain ``create_table`` is equivalent without
  spatial indexes and matches ``0009``. All foreign keys are RESTRICT.

Downgrade drops both tables and every zone and fee in them. No other table
refers to them yet; once orders or addresses do, this downgrade fails rather
than deleting those rows.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-26 16:20:45+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography

revision: str = "0014"
down_revision: str | Sequence[str] | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _geography(geometry_type: str) -> Geography:
    # Frozen copy of the model's column type; migrations do not import app code.
    return Geography(geometry_type=geometry_type, srid=4326, spatial_index=False)


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


def upgrade() -> None:
    """Create the zone and fee tables and the case-insensitive name index."""
    op.create_table(
        "service_zones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("centre", _geography("POINT"), nullable=False),
        sa.Column("boundary", _geography("POLYGON"), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_zones")),
    )
    op.create_index(
        "uq_service_zones_name_lower",
        "service_zones",
        [sa.literal_column("lower(name)")],
        unique=True,
    )
    op.create_table(
        "service_zone_delivery_fees",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("zone_id", sa.Uuid(), nullable=False),
        sa.Column("water_category_id", sa.Uuid(), nullable=False),
        sa.Column("fee_minor_units", sa.BigInteger(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "fee_minor_units >= 0",
            name=op.f("ck_service_zone_delivery_fees_fee_not_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["water_category_id"],
            ["water_categories.id"],
            name=op.f("fk_service_zone_delivery_fees_water_category_id_water_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["service_zones.id"],
            name=op.f("fk_service_zone_delivery_fees_zone_id_service_zones"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_zone_delivery_fees")),
        sa.UniqueConstraint(
            "zone_id",
            "water_category_id",
            name=op.f("uq_service_zone_delivery_fees_zone_id"),
        ),
    )
    op.create_index(
        op.f("ix_service_zone_delivery_fees_water_category_id"),
        "service_zone_delivery_fees",
        ["water_category_id"],
        unique=False,
    )


def downgrade() -> None:
    """Drop both tables; every zone and fee is lost."""
    op.drop_index(
        op.f("ix_service_zone_delivery_fees_water_category_id"),
        table_name="service_zone_delivery_fees",
    )
    op.drop_table("service_zone_delivery_fees")
    op.drop_index("uq_service_zones_name_lower", table_name="service_zones")
    op.drop_table("service_zones")
