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
  `features/admin/admin.test.tsx`; it fails without the fix.
- **Follow-up (#209):** the same gap was in "Fail this delivery" and in the
  hold review sheet's decisions (resume, continue, withdraw, fail, cancel from
  the sheet). A failed order stays first in the list, so the toast is lost only
  when another order starts waiting while the dialog is open (a new order, a
  withdrawn job); the tests simulate that. `OrderPanel` now has one helper,
  `pinThen`, that pins `?ref=` before the Cancel, Fail and Review-hold
  actions open. Regression tests: "keeps the panel on the failed order…" and
  "keeps the panel on the held order after a hold decision…"; both fail
  without the pin. Checked and left alone: Assign pins before it sends
  (`onBefore`), and the confirm sheet's `useConfirmOrder` does not await the
  refresh, so its toast and pin run first.
- **Status:** resolved
- **Refs:** #176, #209, `frontend/src/features/admin/pages/Orders.tsx`
