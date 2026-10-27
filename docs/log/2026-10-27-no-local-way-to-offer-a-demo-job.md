# 2026-10-27: No local way to put a demo job in front of the demo driver

- **Area:** process
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** for the #12 click-through, the demo driver needed an offer.
  Dispatch only offers a `confirmed` order
  (`409 invalid_order_transition` otherwise), but every seeded demo order is
  `quote_requested`. Confirming needs an active water source, and the local
  database had none (`water_sources`: 0). The admin confirm and assign
  screens are not linked to the backend yet; only cash is.
- **Cause:** the demo seed creates accounts, orders, a zone and the demo
  driver, but no water source and no confirmed or offered order. Sources
  stay on the command-line tool.
- **Fix / workaround:** a local helper script did it through the API.
  - Add and activate one demo source with
    `python -m app.modules.sources.cli add-source ... --simulated` and
    `activate ... --category utility`.
  - Sign in as the demo admin.
  - Confirm the next `quote_requested` demo order with
    `POST /admin/orders/{reference}/transition` (`to: confirmed`, a sample
    manual total).
  - Offer it with `POST /admin/orders/{reference}/assign`.

  A driver holds one live job at a time, so offer the next order only after
  the last one is declined or finished. Seeding a demo source, or a demo
  order already offered to the demo driver, would need its own issue.
- **Seen again** 2026-10-27 (#13): the #12 helper confirmed orders with a
  window starting the next day, and the backend refuses Start job
  (`departed`) before the delivery day
  (`409 transition_requirements_unmet`, `delivery_day_reached`). The helper
  now sets a window starting 3 minutes from now (the confirm step refuses a
  start in the past). The job accepted in the #12 click-through became
  usable only after midnight, Africa/Lagos.
- **Status:** workaround
- **Refs:** #12, #13, `docs/process/local-quote-setup.md`, `backend/app/modules/demo/seed.py`
