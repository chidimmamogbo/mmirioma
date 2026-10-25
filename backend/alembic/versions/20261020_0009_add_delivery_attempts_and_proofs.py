"""Add delivery attempts, contact attempts and delivery proofs (driver job part 2).

Implements "Data needed" in docs/api/deliveries.md, "Driver job endpoints,
part 2 (#51)" (agreed 2026-10-20, PR #74; built in #75). See
docs/features/driver-jobs.md.

- ``delivery_attempts``: one per assignment (unique), created when the driver
  arrives (FR-038): server arrival time, optional consented GPS point,
  ``within_window`` (null without a confirmed window), when unloading was
  recorded complete (#67), and the outcome (``delivered`` or ``failed``,
  CHECK ``ck_delivery_attempts_delivery_outcome``).
- ``contact_attempts``: each attempt to reach the customer, with its time.
- ``delivery_proofs``: delivered litres (positive), the unloading
  confirmation (must be true), server time, and exactly one acknowledgement:
  a verified ``delivery_codes`` row, or an alternative-proof reason
  (``ck_delivery_proofs_one_acknowledgement``).
- GPS points are PostGIS ``geography(POINT, 4326)`` via GeoAlchemy2 (approved
  2026-10-20), with no spatial index: nothing searches by location.
- ``order_exceptions.category`` gains ``partial_delivery``,
  ``customer_unreachable`` and ``alternative_proof``. Autogenerate does not
  compare CHECK constraints, so this part was written by hand.
- Enumerations are VARCHAR plus one named CHECK (as in ``0007``); the
  duplicate CHECKs autogenerate emits for ``Enum(create_constraint=True)``
  were removed (LOG.md, 2026-10-14). All foreign keys are RESTRICT.

Downgrade drops the three tables (their data is lost) and restores the old
category list. It fails while exceptions with the new categories exist,
rather than deleting them; remove or re-categorize those rows first.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-20 12:41:53+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies of the enumerations at this revision. Migrations must not
# import app code that may change later.
DELIVERY_OUTCOMES = ("delivered", "failed")
ACKNOWLEDGEMENT_METHODS = ("delivery_code", "alternative_proof")
ALTERNATIVE_PROOF_REASONS = ("customer_cannot_receive_code", "other")
OLD_EXCEPTION_CATEGORIES = (
    "running_late",
    "unsafe_access",
    "unsafe_transfer",
    "volume_issue",
    "source_concern",
    "vehicle_problem",
    "other",
    "source_mismatch",
    "pickup_safety_concern",
    "partial_pickup",
)
NEW_EXCEPTION_CATEGORIES = (
    *OLD_EXCEPTION_CATEGORIES,
    "partial_delivery",
    "customer_unreachable",
    "alternative_proof",
)
CATEGORY_CHECK = "ck_order_exceptions_exception_category"


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


def _point() -> Geography:
    return Geography(geometry_type="POINT", srid=4326, spatial_index=False)


def upgrade() -> None:
    op.create_table(
        "delivery_attempts",
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("arrival_location", _point(), nullable=True),
        sa.Column("arrival_accuracy_metres", sa.Double(), nullable=True),
        sa.Column("within_window", sa.Boolean(), nullable=True),
        sa.Column("unloading_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(length=20), nullable=True),
        sa.Column("recorded_by", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            f"outcome IN ({_in_list(DELIVERY_OUTCOMES)})",
            name=op.f("ck_delivery_attempts_delivery_outcome"),
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["assignments.id"],
            name=op.f("fk_delivery_attempts_assignment_id_assignments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_delivery_attempts_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by"],
            ["users.id"],
            name=op.f("fk_delivery_attempts_recorded_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_attempts")),
        sa.UniqueConstraint("assignment_id", name=op.f("uq_delivery_attempts_assignment_id")),
    )
    op.create_index(
        op.f("ix_delivery_attempts_order_id"), "delivery_attempts", ["order_id"], unique=False
    )

    op.create_table(
        "contact_attempts",
        sa.Column("delivery_attempt_id", sa.Uuid(), nullable=False),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_by", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["delivery_attempt_id"],
            ["delivery_attempts.id"],
            name=op.f("fk_contact_attempts_delivery_attempt_id_delivery_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by"],
            ["users.id"],
            name=op.f("fk_contact_attempts_recorded_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contact_attempts")),
    )
    op.create_index(
        op.f("ix_contact_attempts_delivery_attempt_id"),
        "contact_attempts",
        ["delivery_attempt_id"],
        unique=False,
    )

    op.create_table(
        "delivery_proofs",
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("delivery_attempt_id", sa.Uuid(), nullable=False),
        sa.Column("delivered_litres", sa.Integer(), nullable=False),
        sa.Column("unloading_confirmed", sa.Boolean(), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("delivery_code_id", sa.Uuid(), nullable=True),
        sa.Column("alternative_reason", sa.String(length=40), nullable=True),
        sa.Column("alternative_note", sa.String(length=500), nullable=True),
        sa.Column("location", _point(), nullable=True),
        sa.Column("location_accuracy_metres", sa.Double(), nullable=True),
        sa.Column("recorded_by", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "(method = 'delivery_code' AND delivery_code_id IS NOT NULL"
            " AND alternative_reason IS NULL)"
            " OR (method = 'alternative_proof' AND delivery_code_id IS NULL"
            " AND alternative_reason IS NOT NULL)",
            name=op.f("ck_delivery_proofs_one_acknowledgement"),
        ),
        sa.CheckConstraint(
            f"alternative_reason IN ({_in_list(ALTERNATIVE_PROOF_REASONS)})",
            name=op.f("ck_delivery_proofs_alternative_proof_reason"),
        ),
        sa.CheckConstraint(
            f"method IN ({_in_list(ACKNOWLEDGEMENT_METHODS)})",
            name=op.f("ck_delivery_proofs_acknowledgement_method"),
        ),
        sa.CheckConstraint(
            "delivered_litres > 0", name=op.f("ck_delivery_proofs_delivered_litres_positive")
        ),
        sa.CheckConstraint(
            "unloading_confirmed", name=op.f("ck_delivery_proofs_unloading_confirmed")
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["assignments.id"],
            name=op.f("fk_delivery_proofs_assignment_id_assignments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_attempt_id"],
            ["delivery_attempts.id"],
            name=op.f("fk_delivery_proofs_delivery_attempt_id_delivery_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_code_id"],
            ["delivery_codes.id"],
            name=op.f("fk_delivery_proofs_delivery_code_id_delivery_codes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_delivery_proofs_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by"],
            ["users.id"],
            name=op.f("fk_delivery_proofs_recorded_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_proofs")),
    )
    op.create_index(
        op.f("ix_delivery_proofs_assignment_id"), "delivery_proofs", ["assignment_id"], unique=False
    )
    op.create_index(
        op.f("ix_delivery_proofs_delivery_attempt_id"),
        "delivery_proofs",
        ["delivery_attempt_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_delivery_proofs_order_id"), "delivery_proofs", ["order_id"], unique=False
    )

    op.drop_constraint(op.f(CATEGORY_CHECK), "order_exceptions", type_="check")
    op.create_check_constraint(
        op.f(CATEGORY_CHECK),
        "order_exceptions",
        f"category IN ({_in_list(NEW_EXCEPTION_CATEGORIES)})",
    )


def downgrade() -> None:
    # Fails (and changes nothing) while rows use the new categories.
    op.drop_constraint(op.f(CATEGORY_CHECK), "order_exceptions", type_="check")
    op.create_check_constraint(
        op.f(CATEGORY_CHECK),
        "order_exceptions",
        f"category IN ({_in_list(OLD_EXCEPTION_CATEGORIES)})",
    )

    op.drop_index(op.f("ix_delivery_proofs_order_id"), table_name="delivery_proofs")
    op.drop_index(op.f("ix_delivery_proofs_delivery_attempt_id"), table_name="delivery_proofs")
    op.drop_index(op.f("ix_delivery_proofs_assignment_id"), table_name="delivery_proofs")
    op.drop_table("delivery_proofs")
    op.drop_index(op.f("ix_contact_attempts_delivery_attempt_id"), table_name="contact_attempts")
    op.drop_table("contact_attempts")
    op.drop_index(op.f("ix_delivery_attempts_order_id"), table_name="delivery_attempts")
    op.drop_table("delivery_attempts")
