"""Add partner accounts: approval, declared vehicle, zones, notifications (#61).

Implements docs/api/partners.md (agreed 2026-10-26, #47). See
docs/features/partners.md.

- ``driver_profiles`` gains:
  - ``approval_status`` (``pending``, ``approved``, ``suspended``). Existing
    rows are drivers the technical lead set up with the command-line tool,
    so they are backfilled ``approved`` and keep working (contract,
    "Approval status"); new rows get their value from the application.
  - the vehicle a partner **declared** at sign-up: ``delivery_type``
    (``keke``, ``tanker``), ``plate`` (4-15 characters, decision 3) and
    ``declared_capacity_gallons`` (500-20,000). All nullable: existing rows
    have none of them, and nothing is invented for them.
  - ``transfer_methods`` (``ground``, ``overhead``; empty by default), set by
    an admin at approval (decision 4).
  - ``new_order_alerts`` and ``sms_updates`` (true by default), stored only
    (decision 5).
  - ``vehicle_profile_id`` becomes nullable: a partner awaiting approval has
    no verified vehicle (decision 8).
- ``driver_service_zones``: the zones a driver works in
  (docs/api/admin-directory.md, "Data needed"), unique per driver and zone.
- ``notifications``: in-app messages per user (SRS §5, FR-050), shared with
  the customer app later (#48).

Enum columns are VARCHAR plus one named CHECK (the schema's convention).
Autogenerate emitted the ``notification_channel`` CHECK twice and none of
the ``driver_profiles`` CHECKs (LOG.md, 2026-10-14), so CHECKs are written
by hand here.

Downgrade drops the new tables and columns, and every partner sign-up's
declared vehicle, zones and notifications with them. It refuses to run
while a driver profile has no vehicle, since ``vehicle_profile_id`` cannot
become NOT NULL again without deleting that partner.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-26 21:53:04+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: str | Sequence[str] | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code.
APPROVAL_STATUSES = ("pending", "approved", "suspended")
DELIVERY_TYPES = ("keke", "tanker")
NOTIFICATION_CHANNELS = ("in_app",)
MIN_DECLARED_GALLONS = 500
MAX_DECLARED_GALLONS = 20_000
PLATE_MIN_LENGTH = 4
PLATE_MAX_LENGTH = 15


def _in(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


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
    # --- driver_profiles ---------------------------------------------------
    # Backfill existing drivers as approved, then drop the default: the
    # application always sets the status (sign-up: pending).
    op.add_column(
        "driver_profiles",
        sa.Column(
            "approval_status",
            sa.String(length=20),
            server_default="approved",
            nullable=False,
        ),
    )
    op.alter_column("driver_profiles", "approval_status", server_default=None)
    op.create_check_constraint(
        "approval_status", "driver_profiles", _in("approval_status", APPROVAL_STATUSES)
    )
    op.add_column(
        "driver_profiles", sa.Column("delivery_type", sa.String(length=10), nullable=True)
    )
    op.create_check_constraint(
        "delivery_type", "driver_profiles", _in("delivery_type", DELIVERY_TYPES)
    )
    op.add_column(
        "driver_profiles", sa.Column("plate", sa.String(length=PLATE_MAX_LENGTH), nullable=True)
    )
    op.create_check_constraint(
        "plate_length",
        "driver_profiles",
        f"char_length(plate) BETWEEN {PLATE_MIN_LENGTH} AND {PLATE_MAX_LENGTH}",
    )
    op.add_column(
        "driver_profiles", sa.Column("declared_capacity_gallons", sa.Integer(), nullable=True)
    )
    op.create_check_constraint(
        "declared_capacity_gallons_range",
        "driver_profiles",
        f"declared_capacity_gallons BETWEEN {MIN_DECLARED_GALLONS} AND {MAX_DECLARED_GALLONS}",
    )
    op.add_column(
        "driver_profiles",
        sa.Column(
            "transfer_methods",
            postgresql.ARRAY(sa.String(length=20)),
            server_default=sa.text("'{}'::varchar[]"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "transfer_methods_values",
        "driver_profiles",
        "transfer_methods <@ ARRAY['ground', 'overhead']::varchar[]",
    )
    op.add_column(
        "driver_profiles",
        sa.Column("new_order_alerts", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "driver_profiles",
        sa.Column("sms_updates", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.alter_column("driver_profiles", "vehicle_profile_id", existing_type=sa.Uuid(), nullable=True)

    # --- driver_service_zones ------------------------------------------------
    op.create_table(
        "driver_service_zones",
        sa.Column("driver_profile_id", sa.Uuid(), nullable=False),
        sa.Column("zone_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["driver_profile_id"],
            ["driver_profiles.id"],
            name=op.f("fk_driver_service_zones_driver_profile_id_driver_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["service_zones.id"],
            name=op.f("fk_driver_service_zones_zone_id_service_zones"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_driver_service_zones")),
        sa.UniqueConstraint(
            "driver_profile_id",
            "zone_id",
            name=op.f("uq_driver_service_zones_driver_profile_id"),
        ),
    )
    op.create_index(
        op.f("ix_driver_service_zones_driver_profile_id"),
        "driver_service_zones",
        ["driver_profile_id"],
    )
    op.create_index(op.f("ix_driver_service_zones_zone_id"), "driver_service_zones", ["zone_id"])

    # --- notifications -------------------------------------------------------
    op.create_table(
        "notifications",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            _in("channel", NOTIFICATION_CHANNELS),
            name=op.f("ck_notifications_notification_channel"),
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_notifications_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_notifications_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index(op.f("ix_notifications_order_id"), "notifications", ["order_id"])
    op.create_index(
        "ix_notifications_user_id_created_at", "notifications", ["user_id", "created_at"]
    )


def downgrade() -> None:
    without_vehicle = (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM driver_profiles WHERE vehicle_profile_id IS NULL"))
        .scalar_one()
    )
    if without_vehicle:
        raise RuntimeError(
            f"{without_vehicle} driver profile(s) have no vehicle (partners awaiting "
            "approval). Link a vehicle or remove them by hand before downgrading."
        )
    op.drop_index("ix_notifications_user_id_created_at", table_name="notifications")
    op.drop_index(op.f("ix_notifications_order_id"), table_name="notifications")
    op.drop_table("notifications")
    op.drop_index(op.f("ix_driver_service_zones_zone_id"), table_name="driver_service_zones")
    op.drop_index(
        op.f("ix_driver_service_zones_driver_profile_id"), table_name="driver_service_zones"
    )
    op.drop_table("driver_service_zones")
    op.alter_column(
        "driver_profiles", "vehicle_profile_id", existing_type=sa.Uuid(), nullable=False
    )
    for column in (
        "sms_updates",
        "new_order_alerts",
        "transfer_methods",
        "declared_capacity_gallons",
        "plate",
        "delivery_type",
        "approval_status",
    ):
        # Dropping a column drops its CHECK constraints with it.
        op.drop_column("driver_profiles", column)
