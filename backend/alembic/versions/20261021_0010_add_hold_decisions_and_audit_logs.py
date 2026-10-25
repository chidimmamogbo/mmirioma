"""Add hold decisions, proof overrides and the audit log (admin hold review, #93).

Implements "Data needed" in docs/api/deliveries.md, "Admin hold review
endpoints" (agreed 2026-10-21, PR #91). See docs/features/admin-hold-review.md.

- ``order_exceptions``: ``resolved_by`` (the administrator), ``resolution``
  (how the hold was closed: ``proof_approved``, ``proof_rejected``,
  ``source_continued``, ``unsafe_resumed``, ``failed``, ``cancelled``,
  ``withdrawn``) and ``resolution_note``. ``resolved_at`` already exists.
- ``delivery_proofs``: the administrator's override of an alternative proof
  (``override_status`` ``pending``/``approved``/``rejected``, who, when, note)
  and how the customer confirmed (``customer_ack_method``, ``_at``,
  ``_note``). Existing alternative proofs become ``pending``; code proofs
  stay null, enforced by ``ck_delivery_proofs_override_only_for_alternative_proof``.
- ``audit_logs`` (SRS §5, contract decision 6): actor, action, target type
  and id, time and small JSON ``metadata``. All foreign keys are RESTRICT.

Enumerations are VARCHAR plus one named CHECK, written by hand: autogenerate
does not compare CHECK constraints and emits duplicates for
``Enum(create_constraint=True)`` (LOG.md, 2026-10-14).

Downgrade drops the audit log and the new columns; decisions recorded in
them are lost, but the holds stay closed (``resolved_at`` is kept).

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-21 14:28:21+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies of the enumerations at this revision. Migrations must not
# import app code that may change later.
HOLD_RESOLUTIONS = (
    "proof_approved",
    "proof_rejected",
    "source_continued",
    "unsafe_resumed",
    "failed",
    "cancelled",
    "withdrawn",
)
OVERRIDE_STATUSES = ("pending", "approved", "rejected")
CUSTOMER_ACK_METHODS = ("phone_call", "in_person_to_staff", "other")


def _in_list(values: Sequence[str]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_audit_logs_actor_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(op.f("ix_audit_logs_actor_id"), "audit_logs", ["actor_id"], unique=False)
    op.create_index(
        "ix_audit_logs_target", "audit_logs", ["target_type", "target_id"], unique=False
    )

    op.add_column("order_exceptions", sa.Column("resolved_by", sa.Uuid(), nullable=True))
    op.add_column("order_exceptions", sa.Column("resolution", sa.String(length=20), nullable=True))
    op.add_column(
        "order_exceptions", sa.Column("resolution_note", sa.String(length=500), nullable=True)
    )
    op.create_foreign_key(
        op.f("fk_order_exceptions_resolved_by_users"),
        "order_exceptions",
        "users",
        ["resolved_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_order_exceptions_hold_resolution"),
        "order_exceptions",
        f"resolution IN ({_in_list(HOLD_RESOLUTIONS)})",
    )

    op.add_column(
        "delivery_proofs", sa.Column("override_status", sa.String(length=20), nullable=True)
    )
    op.add_column("delivery_proofs", sa.Column("override_decided_by", sa.Uuid(), nullable=True))
    op.add_column(
        "delivery_proofs",
        sa.Column("override_decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "delivery_proofs", sa.Column("override_note", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "delivery_proofs", sa.Column("customer_ack_method", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "delivery_proofs",
        sa.Column("customer_ack_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "delivery_proofs", sa.Column("customer_ack_note", sa.String(length=500), nullable=True)
    )
    op.create_foreign_key(
        op.f("fk_delivery_proofs_override_decided_by_users"),
        "delivery_proofs",
        "users",
        ["override_decided_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_delivery_proofs_override_status"),
        "delivery_proofs",
        f"override_status IN ({_in_list(OVERRIDE_STATUSES)})",
    )
    op.create_check_constraint(
        op.f("ck_delivery_proofs_customer_ack_method"),
        "delivery_proofs",
        f"customer_ack_method IN ({_in_list(CUSTOMER_ACK_METHODS)})",
    )
    # Alternative proofs recorded before this revision are waiting for an
    # administrator; nothing could decide them yet.
    op.execute(
        "UPDATE delivery_proofs SET override_status = 'pending' WHERE method = 'alternative_proof'"
    )
    op.create_check_constraint(
        op.f("ck_delivery_proofs_override_only_for_alternative_proof"),
        "delivery_proofs",
        "(method = 'alternative_proof') = (override_status IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_delivery_proofs_override_only_for_alternative_proof"),
        "delivery_proofs",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_delivery_proofs_customer_ack_method"), "delivery_proofs", type_="check"
    )
    op.drop_constraint(op.f("ck_delivery_proofs_override_status"), "delivery_proofs", type_="check")
    op.drop_constraint(
        op.f("fk_delivery_proofs_override_decided_by_users"), "delivery_proofs", type_="foreignkey"
    )
    for column in (
        "customer_ack_note",
        "customer_ack_at",
        "customer_ack_method",
        "override_note",
        "override_decided_at",
        "override_decided_by",
        "override_status",
    ):
        op.drop_column("delivery_proofs", column)

    op.drop_constraint(
        op.f("ck_order_exceptions_hold_resolution"), "order_exceptions", type_="check"
    )
    op.drop_constraint(
        op.f("fk_order_exceptions_resolved_by_users"), "order_exceptions", type_="foreignkey"
    )
    for column in ("resolution_note", "resolution", "resolved_by"):
        op.drop_column("order_exceptions", column)

    op.drop_index("ix_audit_logs_target", table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_actor_id"), table_name="audit_logs")
    op.drop_table("audit_logs")
