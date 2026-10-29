"""The admin order list sample stays true to the contract (docs/api/deliveries.md, #204, #243).

``docs/api/examples/admin-orders-page.json`` is what the admin client is built
against, so it must validate against the built list schema, and each item must
carry ``driver`` (a person, or null). No database needed.
"""

import json
from pathlib import Path

from app.modules.deliveries.admin_schemas import HeldAdminOrderPage

EXAMPLE = (
    Path(__file__).resolve().parents[2] / "docs" / "api" / "examples" / "admin-orders-page.json"
)


def test_the_sample_validates_against_the_list_schema() -> None:
    page = HeldAdminOrderPage.model_validate_json(EXAMPLE.read_text(encoding="utf-8"))
    assert page.total == len(page.items)
    assert [item.driver is not None for item in page.items] == [False, False, True, True]
    assert page.items[2].driver is not None
    assert page.items[2].driver.name == "Sample Driver One"
    # An ended order keeps the driver who held it (#243).
    ended = page.items[3]
    assert ended.driver is not None
    assert (ended.status.value, ended.driver.name) == ("delivered", "Sample Driver One")


def test_every_item_states_its_driver_even_when_there_is_none() -> None:
    for item in json.loads(EXAMPLE.read_text(encoding="utf-8"))["items"]:
        assert "driver" in item
