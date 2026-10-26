# 2026-10-26: Price contract issue and pricing mock disagree with the SRS

- **Area:** process
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** Three conflicts found while writing the #10 contract.
  1. Issue #10's Scope says "Amend `docs/api/orders.md`", but its "Done when"
     says "A new `docs/api/<name>.md` with `Status: proposed`".
  2. `frontend/src/mocks/pricing.ts` prices water per jerrycan or per tank
     size and source, with a flat, per-area or per-km delivery fee. SRS v0.3
     FR-022 prices water per litre from the supplier's cost and adds a
     delivery cost from OSRM road distance, handling and margin, rounded up
     to whole naira.
  3. The comment on `TANK_LITRES` in `frontend/src/domain/orders.ts` says
     "litres are never computed from gallons", but decision 2 in
     `docs/architecture/api-mapping.md` says Tanker litres are gallons × 4,
     exactly.
- **Cause:** The design and mocks were written before SRS v0.3 settled
  pricing, and the issue text was written before the "new file" approach.
- **Fix / workaround:** (1) Wrote a new `docs/api/order-details-and-price.md`
  and added a one-line pointer in `orders.md`. (2) The contract follows FR-022
  and lists flat per-unit prices as open question 1. (3) Not fixed: the file
  belongs to the shared domain types; left for its owner.
- **Status:** workaround
- **Refs:** #10, #21, `docs/api/order-details-and-price.md`
