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
- **Status:** workaround
- **Refs:** #12, `docs/process/local-quote-setup.md`, `backend/app/modules/demo/seed.py`
