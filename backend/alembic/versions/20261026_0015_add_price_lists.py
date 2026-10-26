"""Add price lists: versions and their rules (#37).

Implements the price lists section of docs/api/admin-directory.md (agreed
2026-10-26). See docs/features/pricing.md.

- ``price_list_versions``: one row per saved price list. ``version`` is
  unique, so two concurrent saves cannot both create the same version.
  ``effective_from`` is the save time (open question 16: no future dating).
  ``changes`` (JSONB) is the field-by-field difference from the previous
  version, worked out once at save.
- ``price_rules``: the rules of a version, in saved order (``position``,
  unique per version): zone and category (``NULL`` = all), the litre band
  (from 600 L, FR-021), the FR-022 amounts in kobo (0 or more), and the margin
  (fixed kobo or percentage in basis points 0-10,000, CHECK
  ``ck_price_rules_margin_shape``). Handling is per order (open question 18).
- Overlapping bands for the same zone and category are refused by the
  service (422 ``price_rules_overlap``); no database constraint expresses
  it simply. All foreign keys are RESTRICT.

Enum columns are VARCHAR plus one named CHECK (the schema's convention).
Autogenerate emitted the ``margin_type`` CHECK twice (LOG.md, 2026-10-14), so
the CHECKs are written by hand here.

Downgrade drops both tables and every saved price list. Nothing refers to
them yet; once quotes do (#21), this downgrade fails rather than deleting
them.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-26 20:10:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: str | Sequence[str] | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code.
MARGIN_TYPES = ("fixed", "percentage")
MIN_BAND_LITRES = 600
MAX_MARGIN_BASIS_POINTS = 10_000


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
    """Create the version and rule tables."""
    op.create_table(
        "price_list_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("changes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        *_timestamps(),
        sa.CheckConstraint("version >= 1", name=op.f("ck_price_list_versions_version_positive")),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_price_list_versions_created_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_price_list_versions")),
        sa.UniqueConstraint("version", name=op.f("uq_price_list_versions_version")),
    )
    op.create_index(
        op.f("ix_price_list_versions_created_by"), "price_list_versions", ["created_by"]
    )

    margin_types = ", ".join(f"'{value}'" for value in MARGIN_TYPES)
    op.create_table(
        "price_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("price_list_version_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("zone_id", sa.Uuid(), nullable=True),
        sa.Column("water_category_id", sa.Uuid(), nullable=True),
        sa.Column("min_litres", sa.Integer(), nullable=False),
        sa.Column("max_litres", sa.Integer(), nullable=True),
        sa.Column("base_delivery_fee_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("distance_rate_minor_units_per_km", sa.BigInteger(), nullable=False),
        sa.Column("additional_trip_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("handling_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("margin_type", sa.String(length=10), nullable=False),
        sa.Column("margin_amount_minor_units", sa.BigInteger(), nullable=True),
        sa.Column("margin_basis_points", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            f"margin_type IN ({margin_types})", name=op.f("ck_price_rules_margin_type")
        ),
        sa.CheckConstraint(
            "(margin_type = 'fixed' AND margin_amount_minor_units >= 0"
            " AND margin_basis_points IS NULL)"
            " OR (margin_type = 'percentage' AND margin_amount_minor_units IS NULL"
            f" AND margin_basis_points BETWEEN 0 AND {MAX_MARGIN_BASIS_POINTS})",
            name=op.f("ck_price_rules_margin_shape"),
        ),
        sa.CheckConstraint(
            "base_delivery_fee_minor_units >= 0 AND distance_rate_minor_units_per_km >= 0"
            " AND additional_trip_minor_units >= 0 AND handling_minor_units >= 0",
            name=op.f("ck_price_rules_amounts_not_negative"),
        ),
        sa.CheckConstraint(
            "max_litres IS NULL OR max_litres >= min_litres", name=op.f("ck_price_rules_band_order")
        ),
        sa.CheckConstraint(
            f"min_litres >= {MIN_BAND_LITRES}", name=op.f("ck_price_rules_min_litres_floor")
        ),
        sa.ForeignKeyConstraint(
            ["price_list_version_id"],
            ["price_list_versions.id"],
            name=op.f("fk_price_rules_price_list_version_id_price_list_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["water_category_id"],
            ["water_categories.id"],
            name=op.f("fk_price_rules_water_category_id_water_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["service_zones.id"],
            name=op.f("fk_price_rules_zone_id_service_zones"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_price_rules")),
        sa.UniqueConstraint(
            "price_list_version_id",
            "position",
            name=op.f("uq_price_rules_price_list_version_id"),
        ),
    )
    op.create_index(op.f("ix_price_rules_water_category_id"), "price_rules", ["water_category_id"])
    op.create_index(op.f("ix_price_rules_zone_id"), "price_rules", ["zone_id"])


def downgrade() -> None:
    """Drop both tables; every saved price list is lost."""
    op.drop_index(op.f("ix_price_rules_zone_id"), table_name="price_rules")
    op.drop_index(op.f("ix_price_rules_water_category_id"), table_name="price_rules")
    op.drop_table("price_rules")
    op.drop_index(op.f("ix_price_list_versions_created_by"), table_name="price_list_versions")
    op.drop_table("price_list_versions")
