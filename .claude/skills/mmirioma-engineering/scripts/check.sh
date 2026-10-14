#!/usr/bin/env bash
# Run every MmiriOma quality check and exit non-zero if any fails.
#   bash check.sh        backend lint/format/tests, frontend lint/typecheck/tests/build
#   bash check.sh --db   also alembic check + integration tests against the local DB
# Linux/macOS shells and Git Bash on Windows.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WITH_DB=false
[ "${1:-}" = "--db" ] && WITH_DB=true

failures=()
run() {
  local label="$1"; shift
  echo "==> $label"
  if "$@"; then echo "    ok"; else echo "    FAILED: $label"; failures+=("$label"); fi
}

VENV_BIN="$ROOT/backend/.venv/bin"
[ -d "$VENV_BIN" ] || VENV_BIN="$ROOT/backend/.venv/Scripts"
if [ ! -d "$VENV_BIN" ]; then
  echo "backend/.venv not found. Run: cd backend && python -m venv .venv && pip install -r requirements-dev.txt"
  exit 1
fi

cd "$ROOT/backend" || exit 1
run "backend: ruff check" "$VENV_BIN/ruff" check .
run "backend: ruff format --check" "$VENV_BIN/ruff" format --check .
if $WITH_DB; then
  DB_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" 2>/dev/null | cut -d= -f2-)"
  if [ -z "$DB_URL" ]; then
    echo "==> DATABASE_URL not found in .env; cannot run --db checks"
    failures+=("backend: DATABASE_URL missing")
  else
    run "backend: alembic check" "$VENV_BIN/alembic" check
    run "backend: pytest (with integration)" env TEST_DATABASE_URL="$DB_URL" "$VENV_BIN/pytest" -q -W error
  fi
else
  run "backend: pytest" "$VENV_BIN/pytest" -q -W error
fi

cd "$ROOT/frontend" || exit 1
run "frontend: lint" npm run -s lint
run "frontend: typecheck" npm run -s typecheck
run "frontend: test" npm test -s
run "frontend: build" npm run -s build

cd "$ROOT" || exit 1
run "git: whitespace in tracked changes" git diff --check

echo
if [ ${#failures[@]} -eq 0 ]; then
  echo "All checks passed."
else
  echo "Failed checks:"; printf '  - %s\n' "${failures[@]}"; exit 1
fi
