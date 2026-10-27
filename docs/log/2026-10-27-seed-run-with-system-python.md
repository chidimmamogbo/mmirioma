# 2026-10-27: Demo seed failed with `No module named 'geoalchemy2'`

- **Area:** tooling
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** `python -m app.modules.demo.seed` from `backend/` failed at
  `import app.models`:
  `ModuleNotFoundError: No module named 'geoalchemy2'`, raised from
  `app/modules/deliveries/models.py`, line 37.
- **Cause:** the shell's `python` was the system Python
  (`C:\Python314\python.exe`), not `backend\.venv`. `GeoAlchemy2==0.20.0` is
  pinned in `requirements.txt` and installed only in the virtualenv.
- **Fix / workaround:** activate the virtualenv first
  (`.venv\Scripts\Activate.ps1` in PowerShell,
  `source .venv/Scripts/activate` in Git Bash), or run
  `.venv\Scripts\python -m app.modules.demo.seed`. `where python` shows
  which Python a shell will use.
- **Status:** resolved
- **Refs:** #63, `docs/features/demo-data.md`
