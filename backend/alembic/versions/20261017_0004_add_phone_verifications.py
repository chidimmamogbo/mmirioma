"""Add phone verifications (SRS v0.2 FR-003, FR-004).

Creates ``phone_verifications``: one row per SMS code sent to verify an
account's phone or a new phone number. Codes are stored only as HMAC hashes.
See docs/features/authentication.md.

- ``purpose`` is VARCHAR plus a named CHECK constraint (as ``users.role``).
  Autogenerate emitted the CHECK twice; only the ``ck_*`` copy is kept
  (LOG.md, 2026-10-14).
- ``attempts`` is limited to 0-5 by the database (FR-003: at most 5 tries).
- ``ix_phone_verifications_phone_created_at`` serves the per-phone sending
  limits (one code per 60 seconds, three per hour).
- Rows are deleted with their user (CASCADE): they are verification records
  of that account, not business records like orders.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-17 12:55:22.070761+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copy of VerificationPurpose at this revision.
VERIFICATION_PURPOSES = ("account_phone", "phone_change")
_PURPOSE_LIST = ", ".join(f"'{purpose}'" for purpose in VERIFICATION_PURPOSES)


def upgrade() -> None:
    op.create_table(
        "phone_verifications",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("phone", sa.String(length=16), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_phone", sa.String(length=16), nullable=True),
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
        sa.CheckConstraint(
            f"purpose IN ({_PURPOSE_LIST})",
            name=op.f("ck_phone_verifications_verification_purpose"),
        ),
        sa.CheckConstraint(
            "attempts BETWEEN 0 AND 5", name=op.f("ck_phone_verifications_attempts_range")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_phone_verifications_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_phone_verifications")),
    )
    op.create_index(
        "ix_phone_verifications_phone_created_at",
        "phone_verifications",
        ["phone", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_phone_verifications_user_id"), "phone_verifications", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_phone_verifications_user_id"), table_name="phone_verifications")
    op.drop_index("ix_phone_verifications_phone_created_at", table_name="phone_verifications")
    op.drop_table("phone_verifications")
