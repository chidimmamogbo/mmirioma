# 2026-10-27: The admin zone list does not name the pilot water category

- **Area:** process
- **Author:** Cloudcrackamara (+ Claude Code)
- **Symptom:** #74 links the Service areas screen, whose one fee field is
  the pilot water category's fee (admin-directory.md, mapping table). The
  pilot category exists only as the server setting `PILOT_WATER_CATEGORY`
  (a category code). `GET /admin/service-zones` returns each fee's
  category as `id` and `label` only, and no admin endpoint returns the
  code or the pilot category's id. The client cannot tell which fee is the
  pilot one, or write one for a zone with none, except by guessing from the
  label "Utility Water".
- **Cause:** the agreed mapping row assumed the client knows the pilot
  category; #21 named it as a server setting without exposing it.
- **Fix / workaround:** #74 proposes a contract amendment
  (`pilot_water_category` on `GET /admin/service-zones`, admin-directory.md,
  `Status: proposed`). Until it is agreed and built, the adapter shows the
  fee as empty and refuses to write one (`not_connected`). Before linking a
  field that depends on a server setting, check that some endpoint returns
  it.
- **Status:** workaround
- **Refs:** #74, #21, `docs/api/admin-directory.md`,
  `frontend/src/features/admin/real/areas.ts`
