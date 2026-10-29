# 2026-10-29: The Support page moved on after resolving a request, so the result never showed

- **Area:** frontend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** In the #219 click-through on the real backend, resolving the
  first open request worked (the list went from "2 open" to "1 open"), but the
  detail jumped to the next open request. The line the technical lead approved,
  "Resolved by <name>, <time>. Note: <note>", was never on screen.
- **Cause:** With no `?id=` in the address the page shows the first request of
  the list, and the server lists open requests first. Once a request is
  resolved it drops below the open ones, so another one becomes the first and
  the page moves on. It is the same pattern as
  `2026-10-28-order-panel-lost-its-toast-when-the-list-moved-on.md`. The first
  version of the test did not catch it because its stub put the resolved
  request first in the list after the resolve.
- **Fix / workaround:** `IssueDetail` calls `onBeforeResolve` (pins `?id=` in
  the address) before it sends. The test now serves the list the way the
  server does (another open request first after the resolve) and fails
  without the pin. The mock-mode form was left as it is, so in mock mode the
  page still moves on.
- **Status:** resolved (real mode); open for the mock form
- **Refs:** #219, `frontend/src/features/admin/pages/Support.tsx`,
  `frontend/src/features/admin/support.screens.test.tsx`
