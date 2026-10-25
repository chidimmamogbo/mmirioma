"""Write audit log rows (NFR-004)."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog


def record(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID,
    action: str,
    target_type: str,
    target_id: uuid.UUID,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    """Add an audit row to the caller's transaction. Does not commit.

    The caller commits it together with the action, so both happen or
    neither does.

    Args:
        session: The session the action is written in.
        actor_id: The user who acted.
        action: Snake-case action name, e.g. ``proof_override_approved``.
        target_type: Kind of record, e.g. ``order``.
        target_id: Its id.
        details: Ids and kinds only; never personal data (phones,
            addresses, notes).

    Returns:
        The new, unflushed row.
    """
    row = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
    )
    session.add(row)
    return row
