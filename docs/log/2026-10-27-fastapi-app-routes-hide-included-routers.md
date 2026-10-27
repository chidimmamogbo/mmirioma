# 2026-10-27: `app.routes` does not list the API routes

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** checking that the new admin endpoints were registered (#102)
  by walking `app.main.app.routes` found 5 routes and none under
  `/api/v1/admin`. Reading `api_router.routes` failed with
  `AttributeError: '_IncludedRouter' object has no attribute 'path'`.
- **Cause:** the pinned FastAPI keeps an included router as an
  `_IncludedRouter` entry instead of copying its routes into the app's
  list, so the routes are not on `app.routes` with a `path`.
- **Fix / workaround:** list the paths from the OpenAPI schema:
  `python -c "import app.main as m; print([p for p in m.app.openapi()['paths'] if '/admin/' in p])"`
  (with `DATABASE_URL` and `SESSION_SECRET` set, since importing the app
  reads the settings). Tests that call the endpoints are the real check.
- **Status:** workaround
- **Refs:** #102, `backend/app/api/v1/router.py`.
