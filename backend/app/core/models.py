"""Declarative base and shared column conventions for all ORM models.

Typical model::

    class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
        __tablename__ = "orders"
        ...
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Deterministic constraint names keep Alembic migrations reviewable and reversible.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base class for every ORM model; its metadata is the source for Alembic.

    ``Mapped[datetime]`` columns map to ``TIMESTAMP WITH TIME ZONE`` by default,
    so naive datetimes are never stored by accident.
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {datetime: DateTime(timezone=True)}


class UUIDPrimaryKeyMixin:
    """Adds a UUID ``id`` primary key, generated in Python when the row is created.

    UUIDs avoid exposing sequential, guessable IDs in URLs.
    """

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """Adds ``created_at`` and ``updated_at`` columns, both timezone-aware.

    Both default to the database's ``now()``. ``updated_at`` is refreshed by
    ORM updates only; bulk SQL ``UPDATE`` statements must set it explicitly.
    """

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
