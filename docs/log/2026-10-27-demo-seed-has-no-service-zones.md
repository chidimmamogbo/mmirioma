# 2026-10-27: Demo seed has no service zones, so partner sign-up cannot finish locally

- **Area:** tooling
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** Preparing the #67 click-through against the local backend:
  `GET /api/v1/service-zones` returns `{"items": []}` after
  `python -m app.modules.demo.seed`. Partner sign-up needs an active zone
  (`service_zone_id`), so every real-API sign-up would stop at "We do not
  serve "…" yet." The frontend has no admin screen for zones yet.
- **Cause:** the demo seed creates accounts and orders only. Zones came
  later (#30) and the seed was not extended.
- **Fix / workaround:** before the click-through, sign in as the demo admin
  and create a zone with `POST /api/v1/admin/service-zones`, body
  `{"name": "GRA", "is_active": true, "centre": {"latitude": 6.452, "longitude": 7.51}}`
  (login, then the CSRF token from the session as `X-CSRF-Token`). Adding
  sample zones to the seed would need its own issue.
- **Status:** workaround
- **Refs:** #67, `backend/app/modules/demo/seed.py`, `docs/api/partners.md`
