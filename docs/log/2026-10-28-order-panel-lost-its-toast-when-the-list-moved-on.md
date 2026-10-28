# 2026-10-28: The order panel lost its toast when a cancel moved the order out of the list's first slot

- **Area:** frontend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** In the click-through for #176 on the real backend, opening
  `/admin/orders` (no `?ref=`) and cancelling the first waiting order worked,
  but the toast "Order cancelled. Tell the customer." never showed and the
  panel jumped to the next waiting order instead of reading Cancelled.
  The mock tests did not catch it: they all open an order with `?ref=`.
- **Cause:** With no `?ref=`, the panel shows the first "Awaiting confirmation"
  or "Awaiting rider" order. The cancel refreshes every admin query before the
  dialog's `onDone` runs. The cancelled order drops out of that rule, the
  panel's `key` changes, the old panel unmounts, and its `onDone` (toast,
  pinning) never runs. The old inline `CancelOrder` card avoided this by
  calling `onBefore()` (pin the order in the address) before it sent.
- **Fix / workaround:** The "Cancel this order" button calls `onChange()`
  (pins `?ref=`) before it opens the dialog. Regression test: "keeps the panel
  on the cancelled order when the address names none" in
  `features/admin/admin.test.tsx`; it fails without the fix. The same pattern
  is in the "Fail this delivery" button (`setFailing(true)` without
  `onChange()`); not changed here, left for its own issue.
- **Status:** resolved (cancel); open for "Fail this delivery"
- **Refs:** #176, `frontend/src/features/admin/pages/Orders.tsx`
