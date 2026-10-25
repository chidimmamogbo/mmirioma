"""SMS sending through a configured provider (SRS v0.2 FR-003, FR-050).

Two providers, chosen with ``SMS_PROVIDER``:

- ``mock`` (development and test): sends nothing. It keeps the messages in
  memory (tests read :attr:`MockSmsProvider.outbox`) and logs them on this
  machine with the phone number masked, so a developer can read a
  verification code from the backend console. Production refuses to start
  with it (``core/config.py``), because customers must never be told a code
  was sent when it was not.
- ``termii``: Termii's messaging API, ``POST {TERMII_BASE_URL}/api/sms/send``
  (https://developers.termii.com/messaging-api, checked 2026-10-17). The
  ``dnd`` channel is Termii's recommended route for OTPs; it reaches numbers
  on Nigeria's Do-Not-Disturb list and must be activated on the account.

A failed send raises :class:`SmsDeliveryError`. Callers decide what that means;
for verification codes it means nothing is claimed as sent. Message text may
contain one-time codes, so it is never logged by the Termii provider and the
API key is never logged at all.
"""

import logging
from dataclasses import dataclass, field
from functools import cache
from typing import Protocol

import httpx2

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class SmsDeliveryError(Exception):
    """The provider did not accept the message. The message is safe to log."""


class SmsProvider(Protocol):
    """Something that can send one SMS."""

    async def send(self, *, phone: str, text: str) -> None:
        """Send ``text`` to ``phone`` (E.164).

        Raises:
            SmsDeliveryError: If the message was not accepted.
        """
        ...


def mask_phone(phone: str) -> str:
    """Hide the middle of a phone number for logs (``+234800****001``).

    Args:
        phone: Number in E.164 form.

    Returns:
        The number with all but the first 7 and last 3 characters masked.
    """
    if len(phone) <= 10:
        return "****"
    return phone[:7] + "*" * (len(phone) - 10) + phone[-3:]


@dataclass(frozen=True)
class SentSms:
    """One message recorded by the mock provider."""

    phone: str
    text: str


@dataclass
class MockSmsProvider:
    """Development and test provider: records and logs messages, sends nothing.

    Attributes:
        outbox: Messages "sent" so far, oldest first.
        fail: When True, :meth:`send` raises, to test provider outages.
    """

    outbox: list[SentSms] = field(default_factory=list)
    fail: bool = False

    async def send(self, *, phone: str, text: str) -> None:
        """Record the message and log it locally.

        Raises:
            SmsDeliveryError: If :attr:`fail` is set.
        """
        if self.fail:
            raise SmsDeliveryError("Mock SMS provider set to fail")
        self.outbox.append(SentSms(phone=phone, text=text))
        # Development only (production cannot select this provider): the text
        # is logged so a developer can complete verification locally.
        logger.warning("MOCK SMS (not sent) to %s: %s", mask_phone(phone), text)


class TermiiSmsProvider:
    """Sends SMS through Termii's messaging API.

    Args:
        base_url: Account base URL, without a trailing slash.
        api_key: Termii API key.
        sender_id: Registered sender ID.
        channel: ``dnd`` or ``generic``.
        timeout_seconds: Request timeout.
        transport: Optional httpx2 transport, for tests.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        sender_id: str,
        channel: str,
        timeout_seconds: float,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self._url = f"{base_url}/api/sms/send"
        self._api_key = api_key
        self._sender_id = sender_id
        self._channel = channel
        self._timeout = timeout_seconds
        self._transport = transport

    async def send(self, *, phone: str, text: str) -> None:
        """Send one plain-text SMS.

        Termii takes the number as digits in international form, without
        ``+``. Success is HTTP 2xx with ``"code": "ok"`` in the body.

        Raises:
            SmsDeliveryError: On a network error, a non-2xx status or a body
                without ``"code": "ok"``. The error never includes the text or
                the API key.
        """
        payload = {
            "api_key": self._api_key,
            "to": phone.removeprefix("+"),
            "from": self._sender_id,
            "sms": text,
            "type": "plain",
            "channel": self._channel,
        }
        try:
            async with httpx2.AsyncClient(
                timeout=self._timeout, transport=self._transport
            ) as client:
                response = await client.post(self._url, json=payload)
        except httpx2.HTTPError as exc:
            raise SmsDeliveryError(f"Termii request failed: {type(exc).__name__}") from exc
        if not response.is_success:
            raise SmsDeliveryError(f"Termii returned HTTP {response.status_code}")
        try:
            body = response.json()
        except ValueError as exc:
            raise SmsDeliveryError("Termii returned a non-JSON response") from exc
        if not isinstance(body, dict) or body.get("code") != "ok":
            raise SmsDeliveryError("Termii did not accept the message")
        logger.info(
            "SMS accepted by Termii for %s (message id %s)",
            mask_phone(phone),
            body.get("message_id"),
        )


def build_sms_provider(settings: Settings) -> SmsProvider:
    """Create the provider selected by ``SMS_PROVIDER``.

    Args:
        settings: Validated settings; Termii settings are guaranteed present
            when ``termii`` is selected.

    Returns:
        The provider.
    """
    if settings.sms_provider == "termii":
        if settings.termii_api_key is None or settings.termii_sender_id is None:
            # Unreachable with validated Settings; kept so the types are exact.
            raise RuntimeError("Termii is selected but not configured")
        return TermiiSmsProvider(
            base_url=settings.termii_base_url,
            api_key=settings.termii_api_key.get_secret_value(),
            sender_id=settings.termii_sender_id,
            channel=settings.termii_channel,
            timeout_seconds=settings.sms_timeout_seconds,
        )
    return MockSmsProvider()


@cache
def get_sms_provider() -> SmsProvider:
    """FastAPI dependency returning the process-wide SMS provider.

    Tests override it with a :class:`MockSmsProvider` they can inspect.
    """
    return build_sms_provider(get_settings())
