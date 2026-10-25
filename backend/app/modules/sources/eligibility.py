"""Source eligibility: may this source serve this water category today? (FR-012)

One check, shared by order confirmation (C1, #113) and the hold review's
source review (R2, :mod:`app.modules.deliveries.holds`). Contract:
docs/api/deliveries.md, "Order confirmation endpoints", "Source eligibility
(shared with R2)" (agreed 2026-10-22, PR #111).

The answer is a list of reasons; an empty list means eligible. A source can
have several reasons at once, for example a suspended activation whose
laboratory approval has also expired. Reasons are always listed in the
contract's order (:data:`REASON_ORDER`), because R2 shows the message of the
first one.

"Today" is the calendar date in Africa/Lagos: an approval valid until
``2026-10-31`` still counts on 31 October in Lagos and has expired from
1 November (T-04).
"""

import uuid
from datetime import date
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.sources.models import ActivationStatus, WaterSourceCategory


class EligibilityReason(StrEnum):
    """Why a source cannot serve a category (contract, "Source eligibility")."""

    NOT_ACTIVATED = "not_activated"
    SUSPENDED = "suspended"
    REVOKED = "revoked"
    APPROVAL_EXPIRED = "approval_expired"


#: The contract's order. R2's message comes from the first reason.
REASON_ORDER = (
    EligibilityReason.NOT_ACTIVATED,
    EligibilityReason.SUSPENDED,
    EligibilityReason.REVOKED,
    EligibilityReason.APPROVAL_EXPIRED,
)


def eligibility_reasons(
    activation: WaterSourceCategory | None, *, today: date
) -> list[EligibilityReason]:
    """Return why a source cannot serve a category, or ``[]`` if it can.

    Args:
        activation: The source's activation for the category, or None when
            it has none.
        today: Today's date in Africa/Lagos.

    Returns:
        The reasons in :data:`REASON_ORDER`. ``[]`` means eligible.

    Examples:
        No activation gives ``[not_activated]``. A suspended activation
        whose approval ended yesterday gives ``[suspended, approval_expired]``.
    """
    if activation is None:
        return [EligibilityReason.NOT_ACTIVATED]
    reasons: list[EligibilityReason] = []
    if activation.status is ActivationStatus.SUSPENDED:
        reasons.append(EligibilityReason.SUSPENDED)
    elif activation.status is ActivationStatus.REVOKED:
        reasons.append(EligibilityReason.REVOKED)
    if activation.approved_until < today:
        reasons.append(EligibilityReason.APPROVAL_EXPIRED)
    return reasons


async def source_reasons(
    session: AsyncSession,
    *,
    source_id: uuid.UUID,
    water_category_id: uuid.UUID,
    today: date,
) -> list[EligibilityReason]:
    """Load a source's activation for a category and return its reasons.

    Args:
        session: Database session.
        source_id: The water source.
        water_category_id: The water category.
        today: Today's date in Africa/Lagos.

    Returns:
        As :func:`eligibility_reasons`.
    """
    activation = await session.scalar(
        select(WaterSourceCategory).where(
            WaterSourceCategory.source_id == source_id,
            WaterSourceCategory.water_category_id == water_category_id,
        )
    )
    return eligibility_reasons(activation, today=today)
