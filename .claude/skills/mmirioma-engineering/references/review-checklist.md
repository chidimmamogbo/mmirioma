# Review checklist

Apply to your own diff before reporting, and to review requests. Report each real
issue as blocker, should-fix, or nit, with `file:line`, a concrete failure scenario,
and a fix. Skip style issues that ruff/ESLint already enforce.

## Requirements
- [ ] Implements the cited FR/BR/NFR IDs as written in the SRS. No invented rules; open decisions (PRD §13 / SRS §12) not decided in code.
- [ ] Priority respected (no P2 work); scope matches the task; no placeholders that look operational.
- [ ] No fabricated prices, routes, verification, or integrations; simulated data flagged (BR-09).

## Correctness
- [ ] Edge cases from SRS §8 handled where relevant; zero, negative, and maximum values; timezones (UTC stored, Africa/Lagos shown).
- [ ] State transitions validated by role and prior state; invalid ones return a meaningful error (FR-033).
- [ ] Money as integer kobo; server-side calculation; quote snapshot frozen (FR-022, FR-024).
- [ ] Concurrency and idempotency enforced by the database (FR-025, FR-026, NFR-010, NFR-011).
- [ ] Async: no blocking calls, no lazy loads, no shared sessions, commits in the service.

## API contract
- [ ] Under `/api/v1`; typed schemas; correct status codes; error envelope via `APIError` with stable codes.
- [ ] No silent changes to existing paths, fields, types, or error codes.

## Security and privacy
- [ ] Server-side, per-object authorization for each role (FR-001); minimum necessary data returned.
- [ ] Inputs validated; no client-trusted totals, roles, or statuses; parameterized SQL.
- [ ] No secrets or personal data in code, logs, errors, `VITE_*`, fixtures, or docs (NFR-015, BR-11).
- [ ] Payment status never inferred from customer input (BR-07).
- [ ] Auditable record for state changes, overrides, payment verification, cost edits (NFR-004).

## Architecture and frameworks
- [ ] Logic in services; thin routers; module boundaries respected (NFR-034).
- [ ] No new dependencies or infrastructure without approval.
- [ ] Modern APIs only (no Pydantic v1, `session.query`, `on_event`, `utcnow`, TS `enum`); checked against installed versions.

## Database
- [ ] Migration for every model change: reviewed, reversible or justified, tested up/down, `alembic check` clean.
- [ ] Constraints, enums, and indexes for invariants and common filters.

## Tests
- [ ] New behavior and error paths tested; relevant T-xx acceptance tests automated; bug fixes have regression tests.
- [ ] `scripts/check.sh` passes; results reported truthfully.

## Documentation
- [ ] Docstrings and TSDoc present and accurate; business rules cite requirement IDs.
- [ ] `docs/features/<feature>.md` created or updated (10 sections); architecture docs updated if needed.
- [ ] No outdated or misleading comments remain.
