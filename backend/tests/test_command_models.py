"""Command-line entry points register every model (LOG.md, 2026-10-20).

A model is registered with SQLAlchemy only when its module is imported, and
foreign keys cross modules (``orders.source_id`` points at ``water_sources``,
``order_events.assignment_id`` at ``assignments``). The API imports
everything through ``app.main``; a command that imports only some services
fails on its first write with ``NoReferencedTableError``. ``conftest.py``
imports the app, so each check runs in a fresh interpreter. No database
needed.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
COMMANDS = [
    "app.modules.demo.seed",
    "app.modules.dispatch.cli",
    "app.modules.auth.cli",
    "app.modules.sources.cli",
    "app.modules.privacy.cli",
]

_TABLES = (
    "import json, {module}\n"
    "from app.core.models import Base\n"
    "Base.metadata.sorted_tables  # resolves every foreign key; raises if one is missing\n"
    "print(json.dumps(sorted(Base.metadata.tables)))\n"
)


def tables_after_importing(module: str) -> list[str]:
    """The tables registered in a fresh interpreter after importing ``module``."""
    # Fixed command: this interpreter and code built from COMMANDS, never user input.
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", _TABLES.format(module=module)],
        cwd=BACKEND,
        env={**os.environ, "PYTHONPATH": str(BACKEND)},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr.strip().splitlines()[-1]
    return json.loads(result.stdout)


@pytest.fixture(scope="module")
def app_tables() -> list[str]:
    return tables_after_importing("app.main")


@pytest.mark.parametrize("module", COMMANDS)
def test_command_registers_every_model(module: str, app_tables: list[str]) -> None:
    assert tables_after_importing(module) == app_tables


def test_model_registry_matches_the_app(app_tables: list[str]) -> None:
    # A new module's models must be added to app/models.py (and alembic/env.py).
    assert tables_after_importing("app.models") == app_tables
