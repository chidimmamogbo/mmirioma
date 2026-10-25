"""Delivery codes: generation, hashing and the SMS text (FR-035).

A delivery code is a separate 6-digit code, never the phone-verification
code. It is issued only after the driver records unloading complete (#67),
is valid **10 minutes** (SRS FR-035; final, team decision 2026-10-19), allows
at most 5 verification attempts and works once. Like phone codes, it is
stored only as an HMAC-SHA256 keyed with ``SESSION_SECRET`` and bound to the
row id: with a million possible codes, a plain hash could be reversed by
trying them all.
"""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta

from app.core.config import get_settings
from app.modules.deliveries.models import (
    MAX_DELIVERY_CODE_ATTEMPTS,
    DeliveryCode,
    SmsStatus,
)
from app.shared.phone import format_phone_for_display

CODE_DIGITS = 6
# FR-035 (final, 2026-10-19). Keep the SMS text in step if it ever changes.
CODE_LIFETIME = timedelta(minutes=10)


def generate_code() -> str:
    """Return a random 6-digit code from a cryptographic source, e.g. ``"482913"``."""
    return f"{secrets.randbelow(10**CODE_DIGITS):0{CODE_DIGITS}d}"


def hash_code(code_id: uuid.UUID, code: str) -> str:
    """Return the stored form of a delivery code.

    Args:
        code_id: The ``delivery_codes`` row id.
        code: The 6-digit code.

    Returns:
        64-character hex HMAC-SHA256. The ``delivery-code:`` prefix keeps it
        distinct from phone-verification hashes made with the same key.
    """
    secret = get_settings().session_secret.get_secret_value()
    message = f"delivery-code:{code_id}:{code}".encode()
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def matches(code: DeliveryCode, submitted: str) -> bool:
    """Whether ``submitted`` is the code stored as ``code``.

    Compared in constant time, so response timing reveals nothing about how
    many digits were right.

    Args:
        code: The stored code row.
        submitted: Digits the driver entered.

    Returns:
        True if they match.
    """
    return hmac.compare_digest(hash_code(code.id, submitted), code.code_hash)


def code_message(code: str) -> str:
    """SMS text for a delivery code (FR-050: templates carry the support number).

    Args:
        code: The 6-digit code.

    Returns:
        One SMS (under 160 characters). It asks the customer to give the code
        only after the water is unloaded (FR-035: unloading comes first).
    """
    support = format_phone_for_display(get_settings().support_phone)
    return (
        f"Your MmiriOma delivery code is {code}. Give it to the driver after the "
        f"water is unloaded. Valid 10 minutes. Help: {support}"
    )


def is_usable(code: DeliveryCode, now: datetime) -> bool:
    """Whether a code can still be accepted as proof.

    Args:
        code: The newest code for an order.
        now: Current time.

    Returns:
        False once it is used, replaced, expired or out of attempts.
    """
    return (
        code.used_at is None
        and code.invalidated_at is None
        and code.expires_at > now
        and code.attempts < MAX_DELIVERY_CODE_ATTEMPTS
    )


def new_code_allowed(current: DeliveryCode | None, now: datetime) -> bool:
    """Whether a driver may request a replacement code (docs/api/deliveries.md).

    Allowed when there is no code, or the newest one has expired, used up its
    5 attempts (the team approved a new code after lock-out), or its SMS was
    not accepted by the provider. Not allowed while a code is usable and was
    delivered, because a new code would void the one the customer has.

    Args:
        current: Newest code for the order, or None.
        now: Current time.

    Returns:
        True if a new code may be issued.
    """
    if current is None or current.sms_status is SmsStatus.FAILED:
        return True
    return not is_usable(current, now)
