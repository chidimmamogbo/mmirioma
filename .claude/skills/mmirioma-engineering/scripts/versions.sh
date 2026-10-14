#!/usr/bin/env bash
# Print installed versions of MmiriOma's key dependencies so framework usage can be
# checked against matching official documentation. Linux/macOS shells and Git Bash.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PY=""
for candidate in "$ROOT/backend/.venv/bin/python" "$ROOT/backend/.venv/Scripts/python.exe"; do
  if [ -x "$candidate" ]; then PY="$candidate"; break; fi
done

echo "== Backend (backend/.venv)"
if [ -n "$PY" ]; then
  "$PY" - <<'PY'
import importlib.metadata as md
import platform

print(f"{'python':<23}{platform.python_version()}")
for name in ["fastapi", "starlette", "pydantic", "pydantic-settings", "SQLAlchemy", "alembic",
             "asyncpg", "psycopg", "uvicorn", "pytest", "httpx2", "ruff"]:
    try:
        print(f"{name:<23}{md.version(name)}")
    except md.PackageNotFoundError:
        print(f"{name:<23}(not installed)")
PY
else
  echo "backend/.venv not found (cd backend && python -m venv .venv && pip install -r requirements-dev.txt)"
fi

echo
echo "== Frontend (frontend/node_modules)"
if [ -d "$ROOT/frontend/node_modules" ]; then
  (cd "$ROOT/frontend" && node -e '
    const fs = require("fs");
    const pkgs = ["react", "react-dom", "typescript", "vite", "vitest", "tailwindcss",
      "@tailwindcss/vite", "@tanstack/react-query", "react-router-dom", "react-hook-form",
      "zod", "eslint"];
    console.log("node".padEnd(23) + process.versions.node);
    for (const p of pkgs) {
      const file = `node_modules/${p}/package.json`;
      const v = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).version : "(not installed)";
      console.log(p.padEnd(23) + v);
    }')
else
  echo "frontend/node_modules not found (cd frontend && npm install)"
fi

echo
echo "== Database image (compose.yaml)"
grep -E '^\s*image:' "$ROOT/compose.yaml" 2>/dev/null | sed 's/^ *//'
