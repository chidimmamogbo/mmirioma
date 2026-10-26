# 2026-10-26: Tests looked for role "dialog"; ConfirmDialog is an alertdialog

- **Area:** frontend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** a new page test failed with `TestingLibraryElementError:
  Unable to find role="dialog"` after clicking "Confirm received".
- **Cause:** `components/ui/ConfirmDialog.tsx` renders `role="alertdialog"`
  (it asks before an action), not `dialog`.
- **Fix / workaround:** query `getByRole('alertdialog', { name })`, as
  `components/ui/ui.test.tsx` does.
- **Status:** resolved
- **Refs:** #19, `frontend/src/features/admin/admin.test.tsx`
