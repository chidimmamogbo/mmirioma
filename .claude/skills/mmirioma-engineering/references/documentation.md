# Documentation standards

## Python: Google-style docstrings

Required on public modules, classes, functions, methods, and all service functions.
Include `Args`, `Returns`/`Yields`, and `Raises` where they apply. Cite requirement IDs
for business rules.

```python
async def reserve_slot(session: AsyncSession, slot_id: UUID, litres: int) -> DeliverySlot:
    """Reserve capacity in a delivery slot for a confirmed order.

    Uses a conditional UPDATE so two concurrent confirmations cannot both take
    the last capacity (FR-025, NFR-010, test T-05).

    Args:
        session: Request-scoped session; the caller commits.
        slot_id: Slot to reserve.
        litres: Volume to reserve, in whole litres.

    Returns:
        The updated slot.

    Raises:
        APIError: 409 ``slot_unavailable`` if remaining capacity is insufficient.
    """
```

(Illustrative; this function does not exist yet.)

## TypeScript: TSDoc

Required on exported components, hooks, utilities, and complex functions. Document
props on the props interface fields. Explain non-obvious effects and state.

```tsx
interface QuoteSummaryProps {
  /** Server-computed total in kobo; never recomputed client-side (FR-022). */
  totalMinorUnits: number
  /** ISO timestamp after which the quote must be re-requested (SRS §8 `quote_expired`). */
  validUntil: string
}
```

## Comments

- Explain **why**: business rules (with FR/BR/NFR IDs), constraints, concurrency and security reasoning, and workarounds (link the issue or doc).
- Mandatory for pricing and rounding, authorization decisions, payment verification, and order/delivery state transitions.
- Never: comments that restate code, commented-out code, or TODOs without an issue or owner.
- When behavior changes, update or delete affected comments in the same change.

## Feature documents: `docs/features/<feature>.md`

One per significant feature **that exists in code**. Never create placeholders. Use
these sections exactly. Write "None" when one genuinely does not apply.

```markdown
# <Feature name>

Requirements: FR-..., BR-..., NFR-... · Acceptance tests: T-...

## 1. Overview and purpose
## 2. Feature workflow
## 3. Important files
| File | Responsibility |
## 4. Database models and relationships
<!-- tables, key columns, constraints, relationships, migration revision IDs -->
## 5. API endpoints
| Method | Path | Roles | Request | Success | Errors (status + code) |
## 6. Business rules
<!-- each rule with its requirement ID; note any open decision (PRD §13 / SRS §12) still pending -->
## 7. Authentication and authorization
## 8. Error handling and edge cases
<!-- include the relevant SRS §8 edge cases -->
## 9. Testing
<!-- commands; which T-xx acceptance tests are automated -->
## 10. Known limitations
```

Cross-cutting changes (configuration, database layer, error envelope, API client) are
documented in `docs/architecture/backend.md` or `docs/architecture/frontend.md`.
