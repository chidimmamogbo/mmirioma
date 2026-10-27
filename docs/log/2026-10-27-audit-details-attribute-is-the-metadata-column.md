# 2026-10-27: Raw SQL used the attribute name of the audit metadata column

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** a new integration test failed with
  `psycopg.errors.UndefinedColumn: column a.details does not exist`.
- **Cause:** `AuditLog.details` maps to the column `metadata` (SRS §5 name;
  `metadata` is reserved on SQLAlchemy declarative classes). Raw SQL needs
  the column name.
- **Fix / workaround:** select `a.metadata` in raw SQL; use `details` only
  through the ORM.
- **Status:** resolved
- **Refs:** #56, `backend/app/modules/audit/models.py`
