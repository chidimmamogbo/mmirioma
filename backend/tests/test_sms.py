"""SMS provider adapters (FR-003). No network: Termii is reached through a mock transport."""

import json

import httpx2
import pytest

from app.core.config import Settings
from app.modules.messaging.sms import (
    MockSmsProvider,
    SmsDeliveryError,
    TermiiSmsProvider,
    build_sms_provider,
    mask_phone,
)

API_KEY = "test-key-not-real"


def termii(handler: httpx2.MockTransport) -> TermiiSmsProvider:
    return TermiiSmsProvider(
        base_url="https://api.ng.termii.com",
        api_key=API_KEY,
        sender_id="MmiriOma",
        channel="dnd",
        timeout_seconds=5,
        transport=handler,
    )


@pytest.mark.anyio
async def test_mock_provider_records_and_can_fail() -> None:
    provider = MockSmsProvider()
    await provider.send(phone="+2348000000001", text="hello")
    assert [(sms.phone, sms.text) for sms in provider.outbox] == [("+2348000000001", "hello")]

    provider.fail = True
    with pytest.raises(SmsDeliveryError):
        await provider.send(phone="+2348000000001", text="again")
    assert len(provider.outbox) == 1


@pytest.mark.anyio
async def test_termii_sends_the_documented_payload() -> None:
    requests: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        return httpx2.Response(200, json={"code": "ok", "message_id": "123"})

    await termii(httpx2.MockTransport(handler)).send(phone="+2348000000001", text="Code 123456")

    assert str(requests[0].url) == "https://api.ng.termii.com/api/sms/send"
    assert json.loads(requests[0].content) == {
        "api_key": API_KEY,
        "to": "2348000000001",  # international digits, no "+"
        "from": "MmiriOma",
        "sms": "Code 123456",
        "type": "plain",
        "channel": "dnd",
    }


@pytest.mark.anyio
@pytest.mark.parametrize(
    "response",
    [
        httpx2.Response(401, json={"message": "Invalid API key"}),
        httpx2.Response(200, json={"code": "error", "message": "Insufficient balance"}),
        httpx2.Response(200, text="<html>gateway</html>"),
    ],
)
async def test_termii_failures_raise_without_secrets(response: httpx2.Response) -> None:
    provider = termii(httpx2.MockTransport(lambda _: response))
    with pytest.raises(SmsDeliveryError) as raised:
        await provider.send(phone="+2348000000001", text="Code 123456")
    assert API_KEY not in str(raised.value)
    assert "123456" not in str(raised.value)


@pytest.mark.anyio
async def test_termii_network_error_raises() -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("down", request=request)

    with pytest.raises(SmsDeliveryError, match="ConnectError"):
        await termii(httpx2.MockTransport(handler)).send(phone="+2348000000001", text="x")


def test_provider_is_chosen_by_settings() -> None:
    base = {"database_url": "postgresql+asyncpg://u:p@localhost/db"}
    mock = Settings(_env_file=None, **base)  # type: ignore[call-arg]
    real = Settings(  # type: ignore[call-arg]
        _env_file=None,
        **base,
        sms_provider="termii",
        termii_api_key=API_KEY,
        termii_sender_id="MmiriOma",
    )
    assert isinstance(build_sms_provider(mock), MockSmsProvider)
    assert isinstance(build_sms_provider(real), TermiiSmsProvider)


def test_mask_phone_hides_the_middle() -> None:
    assert mask_phone("+2348000000001") == "+234800****001"
    assert mask_phone("123") == "****"
