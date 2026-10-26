# 2026-10-26: A new dispatch eligibility reason breaks the admin dispatch client

- **Area:** frontend
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Found while building #61, before it happened: the backend now
  sends `not_approved` in `reasons` for a pending or suspended partner
  (docs/api/partners.md, an additive change to deliveries.md row 8). The
  admin client parses `reasons` with `z.enum(ELIGIBILITY_REASONS)`
  (`frontend/src/lib/api/adminDispatch.ts`), so the eligible-driver list
  would fail as `invalid_response` once one pending partner exists.
- **Cause:** The client's list of reasons is closed; the contract called the
  reason additive without checking how clients parse it.
- **Fix / workaround:** `not_approved` added to `ELIGIBILITY_REASONS` in the
  same PR as the backend (#61, with the user's OK for lane D's file), with a
  test that a driver list carrying it parses. When a contract adds an enum
  value, check every client that parses it with a closed `z.enum`.
- **Status:** resolved
- **Refs:** #61, #16
