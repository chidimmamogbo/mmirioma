# 2026-10-29: Reports screen test found the same text twice

- **Area:** frontend
- **Author:** Amarachi Janefrancis + agent
- **Symptom:** `TestingLibraryElementError: Found multiple elements with the text: Sample Zone Independence Layout` (also `Area not listed`) from `findByText` / `getByText` on `/admin/reports`.
- **Cause:** The zone, driver and source names appear in more than one place on the admin screen (the table cells and another element), so a single-match query fails.
- **Fix / workaround:** Use `findAllByText` / `getAllByText` with `.length > 0` for names that can repeat in the Reports screen tests.
- **Status:** resolved
- **Refs:** #218, `frontend/src/features/admin/operations.screens.test.tsx`.
