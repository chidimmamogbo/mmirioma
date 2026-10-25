## What and why

<!-- What changed and why. Link the issue: "Closes #NN". -->

Closes #
Lane: <!-- A auth · B customer orders · C partner jobs · D admin orders · E cash (docs/process/linking-plan.md) -->

## Before requesting review

- [ ] Frontend checks pass locally: `npm run lint && npm run typecheck && npm test && npm run build`
- [ ] Backend checks pass locally (if `backend/` changed): `ruff check . && ruff format --check . && pytest`
- [ ] Mock mode still works (`VITE_USE_MOCKS=true`)
- [ ] Only files my lane owns changed, or the shared change is explained below

## Workflow gates (docs/process/ui-driven-development.md)

<!-- Tick what applies; delete the rest. -->

- [ ] **Frontend screens or UI components:** the design is approved
      (`docs/design/<slice>.md`, `Status: approved`): <link>
- [ ] **Frontend or business endpoint:** the contract is agreed
      (`docs/api/<area>.md`, `Status: agreed`): <link>
- [ ] **No gate needed:** authentication, infrastructure, SRS-derived
      persistence, or docs only

## How it was tested

<!-- Commands run and results. Backend: ruff, pytest (with integration).
     Frontend: lint, typecheck, test, build. Manual steps if any. -->

## Migration / config impact

<!-- New migrations (reviewed? up/down/check run?), new settings, or "None". -->

## Checklist

- [ ] Docs updated (`docs/features/`, `docs/api/`, architecture) in this PR
- [ ] New problems recorded in `docs/log/` (one file per entry)
