"""Add cash collection, remittance and reconciliation (#123).

Implements "Data (for the build)" in docs/api/payments.md (agreed G3,
2026-10-22) with the build's amendments (``cash_events``). See
docs/features/cash-remittance.md.

- ``cash_remittances``: one per handover an administrator received; the
  recorded and counted totals (kobo) and their difference, which must equal
  counted minus recorded (CHECK). It is the FR-041 exception record for a
  counted difference (contract decision 1).
- ``cash_collections``: one per order (UNIQUE ``order_id``); amount in kobo,
  whole naira, ₦0 or more (CHECK); the custody status and its who and when.
  Two CHECKs keep the received and reconciled fields in step with the status.
- ``cash_events``: one row per cash step, for the order history.
- ``orders`` gains ``payment_method``, ``payment_status`` (FR-040 values),
  ``outstanding_balance_minor_units`` and ``overpaid_minor_units`` (kobo,
  default 0, never negative).

**Data step (contract decision 8):** orders that are ``confirmed`` or later
and not ``cancelled`` get ``pay_on_delivery`` / ``pending_collection``, as
every pilot order is pay on delivery (F4) and none was paid in the app
before this revision. Other orders keep NULL until they are confirmed.

Downgrade drops the three tables and the four order columns: every cash
record and payment status is lost. Run it only on a database with no real
cash records, or after exporting them with a reviewed plan.

Enum columns are VARCHAR plus a CHECK (the schema's convention). Alembic
autogenerate emitted each enum CHECK twice and did not see the orders CHECK,
so the CHECKs are written by hand here (LOG.md, 2026-10-23).

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-23 09:25:45+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | Sequence[str] | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies at this revision. Migrations must not import app code.
COLLECTION_STATUSES = ("collected", "awaiting_remittance", "remitted", "reconciled")
SMS_STATUSES = ("accepted", "failed")
EVENT_KINDS = (
    "cash_recorded",
    "cash_handed_over",
    "cash_corrected",
    "cash_received",
    "cash_reconciled",
)
PAYMENT_METHODS = ("pay_on_delivery",)
PAYMENT_STATUSES = (
    "unpaid",
    "awaiting_verification",
    "pending_collection",
    "partially_paid",
    "paid",
    "partially_refunded",
    "refunded",
    "disputed",
)
# FR-033: confirmed and every status after it, except cancelled.
CONFIRMED_OR_LATER = (
    "confirmed",
    "assigned",
    "accepted",
    "departed",
    "collected",
    "en_route",
    "arrived",
    "unloading",
    "delivered",
    "failed",
    "disputed",
)


def _in_list(values: Sequence[str]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def _timestamps() -> list[sa.Column]:
    return [
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
    ]


def _user_fk(table: str, column: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column], ["users.id"], name=op.f(f"fk_{table}_{column}_users"), ondelete="RESTRICT"
    )


def upgrade() -> None:
    op.create_table(
        "cash_remittances",
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("counted_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("difference_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("received_by", sa.Uuid(), nullable=False),
        sa.Column("remitted_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "recorded_minor_units >= 0 AND counted_minor_units >= 0 "
            "AND counted_minor_units % 100 = 0",
            name=op.f("ck_cash_remittances_amounts_whole_naira"),
        ),
        sa.CheckConstraint(
            "difference_minor_units = counted_minor_units - recorded_minor_units",
            name=op.f("ck_cash_remittances_difference_matches"),
        ),
        _user_fk("cash_remittances", "driver_id"),
        _user_fk("cash_remittances", "received_by"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_remittances")),
    )
    for column in ("driver_id", "received_by"):
        op.create_index(op.f(f"ix_cash_remittances_{column}"), "cash_remittances", [column])

    op.create_table(
        "cash_collections",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("amount_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("original_amount_minor_units", sa.BigInteger(), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("remittance_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("handed_over_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("corrected_by", sa.Uuid(), nullable=True),
        sa.Column("corrected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("correction_reason", sa.String(length=500), nullable=True),
        sa.Column("remittance_id", sa.Uuid(), nullable=True),
        sa.Column("remitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_by", sa.Uuid(), nullable=True),
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reconciled_by", sa.Uuid(), nullable=True),
        sa.Column("reconciliation_note", sa.String(length=500), nullable=True),
        sa.Column("payment_sms_status", sa.String(length=20), nullable=True),
        sa.Column("payment_sms_attempted_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            "amount_minor_units >= 0 AND amount_minor_units % 100 = 0",
            name=op.f("ck_cash_collections_amount_whole_naira"),
        ),
        sa.CheckConstraint(
            f"status IN ({_in_list(COLLECTION_STATUSES)})",
            name=op.f("ck_cash_collections_cash_collection_status"),
        ),
        sa.CheckConstraint(
            f"payment_sms_status IN ({_in_list(SMS_STATUSES)})",
            name=op.f("ck_cash_collections_payment_sms_status"),
        ),
        sa.CheckConstraint(
            "(status IN ('remitted', 'reconciled')) = "
            "(remittance_id IS NOT NULL AND remitted_at IS NOT NULL AND received_by IS NOT NULL)",
            name=op.f("ck_cash_collections_received_fields_match_status"),
        ),
        sa.CheckConstraint(
            "(status = 'reconciled') = (reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL)",
            name=op.f("ck_cash_collections_reconciled_fields_match_status"),
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_cash_collections_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["assignments.id"],
            name=op.f("fk_cash_collections_assignment_id_assignments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["remittance_id"],
            ["cash_remittances.id"],
            name=op.f("fk_cash_collections_remittance_id_cash_remittances"),
            ondelete="RESTRICT",
        ),
        _user_fk("cash_collections", "driver_id"),
        _user_fk("cash_collections", "corrected_by"),
        _user_fk("cash_collections", "received_by"),
        _user_fk("cash_collections", "reconciled_by"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_collections")),
        sa.UniqueConstraint("order_id", name=op.f("uq_cash_collections_order_id")),
    )
    op.create_index(
        op.f("ix_cash_collections_assignment_id"), "cash_collections", ["assignment_id"]
    )
    op.create_index(
        op.f("ix_cash_collections_remittance_id"), "cash_collections", ["remittance_id"]
    )
    op.create_index(
        "ix_cash_collections_driver_id_status", "cash_collections", ["driver_id", "status"]
    )

    op.create_table(
        "cash_events",
        sa.Column("collection_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount_minor_units", sa.BigInteger(), nullable=False),
        sa.Column("previous_amount_minor_units", sa.BigInteger(), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("payment_status", sa.String(length=30), nullable=True),
        sa.Column("outstanding_balance_minor_units", sa.BigInteger(), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            f"kind IN ({_in_list(EVENT_KINDS)})", name=op.f("ck_cash_events_cash_event_kind")
        ),
        sa.CheckConstraint(
            f"payment_status IN ({_in_list(PAYMENT_STATUSES)})",
            name=op.f("ck_cash_events_cash_event_payment_status"),
        ),
        sa.ForeignKeyConstraint(
            ["collection_id"],
            ["cash_collections.id"],
            name=op.f("fk_cash_events_collection_id_cash_collections"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_cash_events_order_id_orders"),
            ondelete="RESTRICT",
        ),
        _user_fk("cash_events", "actor_id"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_events")),
    )
    op.create_index(op.f("ix_cash_events_collection_id"), "cash_events", ["collection_id"])
    op.create_index(
        "ix_cash_events_order_id_occurred_at", "cash_events", ["order_id", "occurred_at"]
    )

    op.add_column("orders", sa.Column("payment_method", sa.String(length=20), nullable=True))
    op.add_column("orders", sa.Column("payment_status", sa.String(length=30), nullable=True))
    op.add_column(
        "orders",
        sa.Column(
            "outstanding_balance_minor_units", sa.BigInteger(), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "orders",
        sa.Column("overpaid_minor_units", sa.BigInteger(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_orders_payment_method"),
        "orders",
        f"payment_method IN ({_in_list(PAYMENT_METHODS)})",
    )
    op.create_check_constraint(
        op.f("ck_orders_payment_status"),
        "orders",
        f"payment_status IN ({_in_list(PAYMENT_STATUSES)})",
    )
    op.create_check_constraint(
        op.f("ck_orders_payment_balances_not_negative"),
        "orders",
        "outstanding_balance_minor_units >= 0 AND overpaid_minor_units >= 0",
    )
    # The IN list comes from the frozen constants above, never from input.
    op.execute(
        "UPDATE orders SET payment_method = 'pay_on_delivery', "  # noqa: S608
        "payment_status = 'pending_collection' "
        f"WHERE status IN ({_in_list(CONFIRMED_OR_LATER)})"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_orders_payment_balances_not_negative"), "orders", type_="check")
    op.drop_constraint(op.f("ck_orders_payment_status"), "orders", type_="check")
    op.drop_constraint(op.f("ck_orders_payment_method"), "orders", type_="check")
    for column in (
        "overpaid_minor_units",
        "outstanding_balance_minor_units",
        "payment_status",
        "payment_method",
    ):
        op.drop_column("orders", column)
    op.drop_index("ix_cash_events_order_id_occurred_at", table_name="cash_events")
    op.drop_index(op.f("ix_cash_events_collection_id"), table_name="cash_events")
    op.drop_table("cash_events")
    op.drop_index("ix_cash_collections_driver_id_status", table_name="cash_collections")
    op.drop_index(op.f("ix_cash_collections_remittance_id"), table_name="cash_collections")
    op.drop_index(op.f("ix_cash_collections_assignment_id"), table_name="cash_collections")
    op.drop_table("cash_collections")
    for column in ("received_by", "driver_id"):
        op.drop_index(op.f(f"ix_cash_remittances_{column}"), table_name="cash_remittances")
    op.drop_table("cash_remittances")
