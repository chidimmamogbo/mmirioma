"""Public website endpoints: ``GET /public/contact`` (docs/api/public-site.md).

Agreed 2026-10-26 in #8, built in #56. No session cookie and no CSRF token:
the website reads it before anyone signs in.

- **One central value (FR-055):** ``phone`` is the ``SUPPORT_PHONE`` setting,
  the same value the SMS templates use, and ``whatsapp`` is that number when
  ``SUPPORT_WHATSAPP_ENABLED`` is true, else ``null``. Never from the database
  or an admin screen.
- **Rate limit (NFR-002):** 120 requests per client IP per 10 minutes,
  decided by the technical lead in #56. Generous because many Nigerian mobile
  users share one public IP through carrier NAT, and browsers cache the
  answer for 5 minutes anyway (``Cache-Control: public, max-age=300``). The
  limiter is the auth module's in-memory
  :class:`~app.modules.auth.rate_limit.SlidingWindowLimiter`, with the same
  limitations (per process; the IP is the direct peer).
"""

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import APIError, ErrorResponse
from app.modules.auth.rate_limit import SlidingWindowLimiter

CONTACT_REQUESTS_PER_IP = 120
CONTACT_WINDOW_SECONDS = 10 * 60
CONTACT_CACHE_CONTROL = "public, max-age=300"

router = APIRouter(prefix="/public", tags=["public"])

_contact_limiter = SlidingWindowLimiter(
    limit=CONTACT_REQUESTS_PER_IP, window_seconds=CONTACT_WINDOW_SECONDS
)


def get_contact_limiter() -> SlidingWindowLimiter:
    """FastAPI dependency returning the process-wide contact limiter."""
    return _contact_limiter


ContactLimiter = Annotated[SlidingWindowLimiter, Depends(get_contact_limiter)]


class PublicContact(BaseModel):
    """The support contact (``public-contact.json``).

    Attributes:
        phone: The support number in E.164 form; always present.
        whatsapp: The number for ``https://wa.me/`` links, or ``null`` while
            WhatsApp support is switched off.
    """

    phone: str
    whatsapp: str | None


@router.get(
    "/contact",
    responses={HTTPStatus.TOO_MANY_REQUESTS: {"model": ErrorResponse}},
)
async def get_contact(
    request: Request, response: Response, limiter: ContactLimiter
) -> PublicContact:
    """The support phone and WhatsApp number from backend settings (FR-055).

    Raises:
        APIError: 429 ``too_many_attempts`` with ``Retry-After``.
    """
    # The direct peer; see auth/rate_limit.py for running behind a reverse proxy.
    ip = request.client.host if request.client else "unknown"
    wait = limiter.retry_after(ip)
    if wait is not None:
        raise APIError(
            HTTPStatus.TOO_MANY_REQUESTS,
            "too_many_attempts",
            "Too many attempts. Please wait and try again.",
            details={"retry_after_seconds": wait},
            headers={"Retry-After": str(wait)},
        )
    limiter.hit(ip)
    settings = get_settings()
    response.headers["Cache-Control"] = CONTACT_CACHE_CONTROL
    return PublicContact(
        phone=settings.support_phone,
        whatsapp=settings.support_phone if settings.support_whatsapp_enabled else None,
    )
