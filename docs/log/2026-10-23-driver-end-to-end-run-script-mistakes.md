# 2026-10-23: The #97 end-to-end script failed on its own timestamps and a leftover live job

- **Area:** tooling (end-to-end run)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Driving the frontend's API client against a local backend
  for #97:
  1. Every request was 404: the backend log showed
     `POST /api/v1/api/v1/auth/register`.
  2. Confirming an order was 422 `validation_error`, then recording the
     pickup was 422.
  3. A rerun failed at assignment with 409 "This driver cannot take this
     order."
- **Cause:**
  1. The client's paths already start with `/api/v1`, so the base URL must
     be the server's origin (`http://127.0.0.1:8097`), not `.../api/v1`.
  2. The script set the customer's agreement time and the pickup time one
     second before "now", which fell before the order was sent and before
     the job started; the server rightly refuses both (contract rules).
  3. An interrupted run left a job accepted and started; a driver may hold
     only one live job, so every new offer to that driver was refused.
- **Fix / workaround:** Base URL without `/api/v1`; agreement and pickup
  times set to the current time after a short pause; the script's setup
  cancels a job left live by an earlier run with the admin cancel
  (`mmirioma_unable`), not a database edit. The run then passed.
- **Status:** resolved
- **Refs:** #97, `docs/features/driver-app.md` (end-to-end run)
