"""The plate rule, shared by partner sign-up and the command-line tool.

docs/api/partners.md, decision 3: no check of the Nigerian plate format (the
admin checks the real plate at approval); 4-15 characters of letters, digits,
spaces and hyphens, trimmed and upper-cased.
"""

import re

from app.modules.dispatch.models import PLATE_MAX_LENGTH, PLATE_MIN_LENGTH

_PLATE = re.compile(rf"^[A-Z0-9 -]{{{PLATE_MIN_LENGTH},{PLATE_MAX_LENGTH}}}$")


def normalize_plate(raw: str) -> str:
    """Return the plate trimmed and upper-cased.

    Args:
        raw: The plate as typed, e.g. ``"enu 456 cd"``.

    Returns:
        The stored form, e.g. ``"ENU 456 CD"``.

    Raises:
        ValueError: Outside 4-15 characters after trimming, or a character
            other than a letter, digit, space or hyphen.
    """
    plate = raw.strip().upper()
    if not _PLATE.fullmatch(plate):
        raise ValueError(
            f"Use {PLATE_MIN_LENGTH} to {PLATE_MAX_LENGTH} letters, digits, spaces or hyphens"
        )
    return plate
