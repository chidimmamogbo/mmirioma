# 2026-10-27: SQLAlchemy `Row.tuple()` is deprecated

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** the new admin support request queries (#102) failed under
  `pytest -W error::DeprecationWarning` with
  `sqlalchemy.exc.SADeprecationWarning: The Row.tuple() method is deprecated in favor of Row._tuple(); all Row methods and library-level attributes are intended to be underscored to avoid name conflicts.  Please use Row._tuple(). (deprecated since: 2.0.19)`.
- **Cause:** `row.tuple()` was used to turn a result row into a plain tuple.
  The pinned SQLAlchemy (2.1) deprecates it.
- **Fix / workaround:** unpack the `Row` directly
  (`request, reference, ... = row`), typed as `Row[tuple[...]]`. A `Row`
  already behaves as a named tuple, so no conversion is needed.
- **Status:** resolved
- **Refs:** #102, `backend/app/modules/customers/requests.py` (`_admin_view`).
