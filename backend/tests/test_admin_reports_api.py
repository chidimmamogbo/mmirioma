"""Admin dashboard, reports, live map and activity endpoint tests that need no database.

docs/api/admin-operations.md (#102, part 2): roles (FR-001), the query rules
(``simulated`` is ``exclude`` or ``only``, BR-09; ``date`` not in the
future; ``range`` one of the pills; ``limit`` 1-20) and bodies against the
contract examples, with the reporting service faked. Counting is tested in
test_admin_reports_integration.py.
"""

import json
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.modules.auth.models import User, UserRole
from app.modules.dispatch.service import AvailableDrivers, DriverDeliveries, LiveJob
from app.modules.orders.models import DeliveryType, Order, OrderStatus
from app.modules.orders.reporting import DeliveryCounts, OrderCounts
from app.modules.payments.service import CashTotals
from app.modules.reporting import service as reporting
from app.modules.sources.models import WaterSource
from app.shared.lagos_time import lagos_today
from tests import test_customer_account_api as account_api
from tests.test_customer_account_api import sign_in

api = account_api.api
fake = account_api.fake  # the customer service fakes the shared client needs

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"


def example(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


DASHBOARD = example("admin-dashboard.json")
REPORT = example("admin-report.json")
LIVE_MAP = example("admin-live-map.json")
ACTIVITY = example("admin-activity.json")

ENDPOINTS = [
    "/api/v1/admin/dashboard",
    "/api/v1/admin/reports?range=7d",
    "/api/v1/admin/live-map",
    "/api/v1/admin/activity",
]


def at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def order_counts(body: dict[str, Any], by_type: dict[str, int]) -> OrderCounts:
    return OrderCounts(
        total=body["total"], by_status=body["by_status"], by_delivery_type=by_type, by_zone={}
    )


def delivery_counts(body: dict[str, Any]) -> DeliveryCounts:
    return DeliveryCounts(order_ids=[], by_zone={}, **body)


def cash(body: dict[str, Any]) -> CashTotals:
    return CashTotals(**body)


class FakeReporting:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def dashboard(self, _: object, **kwargs: Any) -> reporting.Dashboard:
        self.calls.append(("dashboard", kwargs))
        body = DASHBOARD
        return reporting.Dashboard(
            day=date.fromisoformat(body["date"]),
            is_simulated=body["is_simulated"],
            orders=order_counts(body["orders"], body["by_delivery_type"]),
            oldest_waiting_minutes=body["orders"]["oldest_waiting_minutes"],
            deliveries=delivery_counts(body["deliveries"]),
            holds_open=body["holds_open"],
            support_requests_open=body["support_requests_open"],
            drivers=AvailableDrivers(**body["drivers_available"]),
            sources_usable=body["sources"]["usable"],
            sources_not_usable=body["sources"]["not_usable"],
            cash=cash(body["cash"]),
        )

    async def report(self, _: object, **kwargs: Any) -> reporting.Report:
        self.calls.append(("report", kwargs))
        body = REPORT
        return reporting.Report(
            range=body["range"],
            from_day=date.fromisoformat(body["from"]),
            to_day=date.fromisoformat(body["to"]),
            is_simulated=body["is_simulated"],
            orders=order_counts(body["orders"], body["by_delivery_type"]),
            deliveries=delivery_counts(body["deliveries"]),
            cash=cash(body["cash"]),
            by_zone=[
                reporting.ZoneRow(
                    zone_id=uuid.UUID(r["zone_id"]) if r["zone_id"] else None,
                    name=r["name"],
                    orders=r["orders"],
                    delivered=r["delivered"],
                )
                for r in body["by_zone"]
            ],
            by_driver=[
                DriverDeliveries(
                    driver=User(id=uuid.UUID(r["driver_id"]), name=r["name"]),
                    plate=r["plate"],
                    delivered=r["delivered"],
                )
                for r in body["by_driver"]
            ],
            by_source=[
                reporting.SourceRow(
                    source_id=uuid.UUID(r["source_id"]), name=r["name"], pickups=r["pickups"]
                )
                for r in body["by_source"]
            ],
        )

    async def live_map(self, _: object) -> reporting.LiveMap:
        self.calls.append(("live_map", {}))
        deliveries = []
        for d in LIVE_MAP["deliveries"]:
            order = Order(
                reference=d["reference"],
                status=OrderStatus(d["status"]),
                delivery_type=DeliveryType(d["delivery_type"]),
                source_id=uuid.UUID(d["source"]["id"]),
                service_zone_id=uuid.UUID(d["zone"]["id"]),
                is_simulated=d["is_simulated"],
            )
            driver = User(id=uuid.UUID(d["driver"]["id"]), name=d["driver"]["name"])
            deliveries.append(
                reporting.LiveMapDelivery(
                    job=LiveJob(order=order, driver=driver, plate=d["driver"]["plate"]),
                    source_name=d["source"]["name"],
                    zone_name=d["zone"]["name"],
                )
            )
        sources = [
            (
                WaterSource(
                    id=uuid.UUID(s["id"]),
                    name=s["name"],
                    approximate_location=s["approximate_location"],
                    is_simulated=s["is_simulated"],
                ),
                s["usable"],
            )
            for s in LIVE_MAP["sources"]
        ]
        return reporting.LiveMap(deliveries=deliveries, sources=sources)

    async def activity(self, _: object, **kwargs: Any) -> list[reporting.ActivityItem]:
        self.calls.append(("activity", kwargs))
        return [
            reporting.ActivityItem(
                id=uuid.UUID(i["id"]),
                at=at(i["at"]),
                kind=i["kind"],
                order_reference=i["order_reference"],
                to_status=OrderStatus(i["to_status"]) if i["to_status"] else None,
                actor=(
                    User(name=i["actor"]["name"], role=UserRole(i["actor"]["role"]))
                    if i["actor"]
                    else None
                ),
                is_simulated=i["is_simulated"],
            )
            for i in ACTIVITY["items"]
        ]


@pytest.fixture
def reports_fake(monkeypatch: pytest.MonkeyPatch) -> FakeReporting:
    fake = FakeReporting()
    for name in ("dashboard", "report", "live_map", "activity"):
        monkeypatch.setattr(reporting, name, getattr(fake, name))
    return fake


def error_code(response: Any) -> str:
    return response.json()["error"]["code"]


@pytest.mark.parametrize("path", ENDPOINTS)
def test_signed_out_is_not_authenticated(
    api: TestClient, reports_fake: FakeReporting, path: str
) -> None:
    response = api.get(path)
    assert (response.status_code, error_code(response)) == (401, "not_authenticated")
    assert reports_fake.calls == []


@pytest.mark.parametrize("role", [UserRole.CUSTOMER, UserRole.DRIVER])
@pytest.mark.parametrize("path", ENDPOINTS)
def test_customers_and_drivers_are_forbidden(
    api: TestClient, reports_fake: FakeReporting, role: UserRole, path: str
) -> None:
    response = api.get(path, headers=sign_in(api, role))
    assert (response.status_code, error_code(response)) == (403, "forbidden")
    assert reports_fake.calls == []


def test_dashboard_matches_the_example_and_defaults_to_real_today(
    api: TestClient, reports_fake: FakeReporting
) -> None:
    response = api.get("/api/v1/admin/dashboard", headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert response.json() == DASHBOARD
    # BR-09: real records by default; today in Lagos.
    assert reports_fake.calls == [("dashboard", {"day": lagos_today(), "simulated": False})]


def test_dashboard_simulated_only_and_a_past_date(
    api: TestClient, reports_fake: FakeReporting
) -> None:
    yesterday = lagos_today() - timedelta(days=1)
    response = api.get(
        f"/api/v1/admin/dashboard?date={yesterday}&simulated=only",
        headers=sign_in(api, UserRole.ADMIN),
    )
    assert response.status_code == 200
    assert reports_fake.calls == [("dashboard", {"day": yesterday, "simulated": True})]


@pytest.mark.parametrize(
    "query",
    [
        "simulated=include",
        "simulated=all",
        f"date={lagos_today() + timedelta(days=1)}",
        "date=2026-13-01",
    ],
)
def test_bad_dashboard_queries_are_validation_errors(
    api: TestClient, reports_fake: FakeReporting, query: str
) -> None:
    response = api.get(f"/api/v1/admin/dashboard?{query}", headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert reports_fake.calls == []


def test_report_matches_the_example(api: TestClient, reports_fake: FakeReporting) -> None:
    response = api.get(
        "/api/v1/admin/reports?range=7d&simulated=only", headers=sign_in(api, UserRole.ADMIN)
    )
    assert response.status_code == 200
    assert response.json() == REPORT
    assert reports_fake.calls == [("report", {"range_name": "7d", "simulated": True})]


@pytest.mark.parametrize("query", ["", "range=90d", "range=7d&simulated=include"])
def test_bad_report_queries_are_validation_errors(
    api: TestClient, reports_fake: FakeReporting, query: str
) -> None:
    response = api.get(f"/api/v1/admin/reports?{query}", headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert reports_fake.calls == []


def test_report_has_no_customer_data(api: TestClient, reports_fake: FakeReporting) -> None:
    # FR-053: aggregates, driver names and source names only.
    text = api.get("/api/v1/admin/reports?range=today", headers=sign_in(api, UserRole.ADMIN)).text
    assert "+234" not in text and "customer" not in text and "earned" not in text


def test_live_map_matches_the_example_without_customer_data(
    api: TestClient, reports_fake: FakeReporting
) -> None:
    response = api.get("/api/v1/admin/live-map", headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert response.json() == LIVE_MAP
    assert "contact" not in response.text and "address" not in response.text


def test_activity_matches_the_example(api: TestClient, reports_fake: FakeReporting) -> None:
    response = api.get("/api/v1/admin/activity?limit=3", headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert response.json() == ACTIVITY
    assert reports_fake.calls == [("activity", {"limit": 3})]


@pytest.mark.parametrize(("query", "limit"), [("", 5), ("limit=20", 20)])
def test_activity_limit_defaults_to_5(
    api: TestClient, reports_fake: FakeReporting, query: str, limit: int
) -> None:
    api.get(f"/api/v1/admin/activity?{query}", headers=sign_in(api, UserRole.ADMIN))
    assert reports_fake.calls == [("activity", {"limit": limit})]


@pytest.mark.parametrize("query", ["limit=0", "limit=21"])
def test_bad_activity_limits_are_validation_errors(
    api: TestClient, reports_fake: FakeReporting, query: str
) -> None:
    response = api.get(f"/api/v1/admin/activity?{query}", headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (422, "validation_error")
