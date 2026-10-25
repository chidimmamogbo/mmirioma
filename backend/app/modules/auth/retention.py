"""Privacy steps on accounts, sessions and phone codes (NFR-005, #129).

Called by ``app.modules.privacy`` for the procedure in
``docs/process/privacy-retention.md`` and the retention table in
``PRIVACY_NOTICE.md`` section 8. Every function adds its changes to the
caller's transaction and does not commit, so a dry run can roll everything
back and a real run commits it together with its audit row.

Decisions (technical lead, 2026-10-23, #129):

- An anonymized customer row is **kept**, deactivated, so the orders and
  audit rows that point at it stay valid (foreign keys are RESTRICT).
- Its phone becomes an anonymization marker: ``+0`` and 14 random digits.
  No E.164 number starts with ``+0`` and sign-in only accepts Nigerian
  numbers, so the marker can never be typed, receive an SMS or clash with a
  real number; the unique constraint still holds.
- Phone verification rows are the record of when a number was verified or
  changed (NFR-004), so the review blanks only their code hash; the rows go
  when the account is anonymized.
"""

import asyncio
import secrets
import uuid
from collections.abc import Collection
from datetime import datetime
from typing import Any, cast

from sqlalchemy import CursorResult, delete, exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import security
from app.modules.auth.models import PhoneVerification, User, UserRole, UserSession

# Shown wherever the account's name used to appear.
ANONYMIZED_NAME = "Deleted customer"
ANONYMIZED_PHONE_PREFIX = "+0"
# users.phone is VARCHAR(16): "+0" plus 14 digits fills it.
_MARKER_DIGITS = 14
# The code hash once the review has removed it; no HMAC is ever empty.
CLEARED_CODE_HASH = ""


def is_anonymized_phone(phone: str) -> bool:
    """True if ``phone`` is an anonymization marker, not a real number."""
    return phone.startswith(ANONYMIZED_PHONE_PREFIX)


async def new_phone_marker(session: AsyncSession) -> str:
    """Return an unused anonymization marker for ``users.phone``.

    Collisions are practically impossible (10^14 values), but the column is
    unique, so a used value is skipped rather than failing the transaction.

    Args:
        session: Database session.

    Returns:
        ``+0`` followed by 14 digits, not used by any account.
    """
    while True:
        marker = ANONYMIZED_PHONE_PREFIX + str(secrets.randbelow(10**_MARKER_DIGITS)).zfill(
            _MARKER_DIGITS
        )
        taken = await session.scalar(select(exists().where(User.phone == marker)))
        if not taken:
            return marker


async def get_customer(session: AsyncSession, *, phone: str) -> User:
    """Return the customer account with this (normalized) phone.

    Args:
        session: Database session.
        phone: E.164 phone number.

    Returns:
        The customer.

    Raises:
        LookupError: No customer account has this phone. The privacy tool
            acts on customer accounts only; staff and drivers are out of
            scope of the notice.
    """
    user = await session.scalar(select(User).where(User.phone == phone))
    if user is None or user.role is not UserRole.CUSTOMER:
        raise LookupError("no customer account has this phone")
    return user


async def anonymize_account(session: AsyncSession, user: User, *, phone_marker: str) -> None:
    """Remove the personal details from a customer account. Does not commit.

    The row is kept (see the module docstring). The name and phone are
    replaced, the password becomes an unknown random one, the account is
    deactivated and loses its phone verification; its sessions and phone
    verification rows, which hold its phone numbers, are deleted.

    Args:
        session: Database session (the caller's transaction).
        user: The customer to anonymize.
        phone_marker: From :func:`new_phone_marker`; also used on the
            customer's orders.
    """
    user.name = ANONYMIZED_NAME
    user.phone = phone_marker
    # Nobody knows this password, and the marker phone cannot be typed at
    # sign-in, so the account can never be used again.
    user.password_hash = await asyncio.to_thread(security.hash_password, secrets.token_urlsafe(32))
    user.is_active = False
    user.phone_verified_at = None
    await session.execute(delete(UserSession).where(UserSession.user_id == user.id))
    await session.execute(delete(PhoneVerification).where(PhoneVerification.user_id == user.id))


def correct_name(user: User, name: str) -> None:
    """Replace a customer's account name (correction request). Does not commit.

    Args:
        user: The customer.
        name: The corrected name, already trimmed and 1-100 characters.
    """
    user.name = name


def _rowcount(result: object) -> int:
    # An UPDATE or DELETE returns a CursorResult; Session.execute is typed
    # with the general Result.
    return cast("CursorResult[Any]", result).rowcount


async def clear_expired_phone_codes(session: AsyncSession, *, now: datetime) -> int:
    """Blank the hash of every phone code that expired before ``now``.

    Notice section 8, "Phone verification codes". A used or replaced code is
    also expired after its 5 minutes, so expiry alone selects them all.
    The rows stay: they record the verification and back the per-phone
    sending limits (``phone_verification.py``).

    Args:
        session: Database session.
        now: The review's time.

    Returns:
        How many codes were cleared.
    """
    result = await session.execute(
        update(PhoneVerification)
        .where(
            PhoneVerification.expires_at < now,
            PhoneVerification.code_hash != CLEARED_CODE_HASH,
        )
        .values(code_hash=CLEARED_CODE_HASH, updated_at=now)
    )
    return _rowcount(result)


async def delete_ended_sessions(session: AsyncSession, *, now: datetime) -> int:
    """Delete sessions that expired or were signed out before ``now``.

    Notice section 8, "Sign-in sessions". An ended session can never be
    used again (``service.get_authenticated_session``).

    Args:
        session: Database session.
        now: The review's time.

    Returns:
        How many sessions were deleted.
    """
    result = await session.execute(
        delete(UserSession).where(or_(UserSession.expires_at < now, UserSession.revoked_at < now))
    )
    return _rowcount(result)


async def unverified_customer_ids(
    session: AsyncSession, *, created_before: datetime
) -> list[uuid.UUID]:
    """Customer accounts never verified and created before a cutoff.

    Notice section 8, "Accounts never verified" (30 days). An anonymized
    customer has no verified phone either; the caller keeps every account
    that has orders (``orders.retention.customers_with_orders``).

    Args:
        session: Database session.
        created_before: Accounts created before this are due.

    Returns:
        Their ids.
    """
    return list(
        await session.scalars(
            select(User.id).where(
                User.role == UserRole.CUSTOMER,
                User.phone_verified_at.is_(None),
                User.created_at < created_before,
            )
        )
    )


async def delete_accounts(session: AsyncSession, *, user_ids: Collection[uuid.UUID]) -> int:
    """Delete accounts. Does not commit.

    Their sessions and phone verifications go with them (``ON DELETE
    CASCADE``). Accounts that orders or audit rows point at cannot be
    deleted (RESTRICT); the caller passes only accounts without orders.

    Args:
        session: Database session.
        user_ids: The accounts.

    Returns:
        How many were deleted.
    """
    if not user_ids:
        return 0
    return _rowcount(await session.execute(delete(User).where(User.id.in_(user_ids))))
