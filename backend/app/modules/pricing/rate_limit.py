"""In-memory rate limits for ``POST /quotes`` (NFR-002, decision E of #21).

NFR-002 asks to "rate-limit ... quote ... endpoints"; the SRS gives no
numbers, so the technical lead set them (#21, decision E):

==========================  =============  ===========
What                        Key            Limit
==========================  =============  ===========
Quote requests              customer id    30 / 10 min
Quote requests              client IP      120 / hour
==========================  =============  ===========

Why: a customer comparing Keke and Tanker sizes asks for a handful of
prices; 30 in 10 minutes leaves room for that while stopping a script from
mapping the price lists (each quote also stores a row). The IP limit is
generous because many Nigerian mobile users share a public IP through
carrier NAT, as for the auth limits.

Every request counts, whatever its answer. The limiters are the auth
module's :class:`~app.modules.auth.rate_limit.SlidingWindowLimiter`, so the
same limitations apply: counters live in this process (cleared on restart,
separate per worker), and the IP is the direct peer address
(docs/features/authentication.md).
"""

from dataclasses import dataclass, field
from http import HTTPStatus

from app.core.errors import APIError
from app.modules.auth.rate_limit import SlidingWindowLimiter

QUOTES_PER_CUSTOMER = 30
QUOTES_PER_CUSTOMER_WINDOW_SECONDS = 10 * 60
QUOTES_PER_IP = 120
QUOTES_PER_IP_WINDOW_SECONDS = 60 * 60


@dataclass
class QuoteRateLimits:
    """The limiters guarding ``POST /quotes`` (limits in the module docstring)."""

    by_customer: SlidingWindowLimiter = field(
        default_factory=lambda: SlidingWindowLimiter(
            limit=QUOTES_PER_CUSTOMER, window_seconds=QUOTES_PER_CUSTOMER_WINDOW_SECONDS
        )
    )
    by_ip: SlidingWindowLimiter = field(
        default_factory=lambda: SlidingWindowLimiter(
            limit=QUOTES_PER_IP, window_seconds=QUOTES_PER_IP_WINDOW_SECONDS
        )
    )

    def check_and_record(self, customer_key: str, ip: str) -> None:
        """Count a quote request, refusing it once the customer or the IP is over its limit.

        Both are checked before either is counted, so a refused request uses
        up nothing. Synchronous, so atomic on the event loop.

        Args:
            customer_key: The customer's id, as text.
            ip: The client IP.

        Raises:
            APIError: 429 ``too_many_attempts`` with ``Retry-After`` (the
                longer wait of the two).
        """
        waits = [self.by_customer.retry_after(customer_key), self.by_ip.retry_after(ip)]
        longest = max((wait for wait in waits if wait is not None), default=None)
        if longest is not None:
            raise APIError(
                HTTPStatus.TOO_MANY_REQUESTS,
                "too_many_attempts",
                "Too many attempts. Please wait and try again.",
                details={"retry_after_seconds": longest},
                headers={"Retry-After": str(longest)},
            )
        self.by_customer.hit(customer_key)
        self.by_ip.hit(ip)

    def clear(self) -> None:
        """Reset both limiters (used by tests)."""
        self.by_customer.clear()
        self.by_ip.clear()


_quote_rate_limits = QuoteRateLimits()


def get_quote_rate_limits() -> QuoteRateLimits:
    """FastAPI dependency returning the process-wide quote limiters."""
    return _quote_rate_limits
