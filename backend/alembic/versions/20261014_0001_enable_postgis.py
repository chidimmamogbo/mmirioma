"""Enable the PostGIS extension.

Revision ID: 0001
Revises:
Create Date: 2026-10-14 00:00:00+00:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    # Intentionally does not drop PostGIS: the postgis/postgis image installs it
    # (and dependent extensions such as postgis_topology) at database creation,
    # so dropping it here would fail or remove objects this migration never owned.
    pass
