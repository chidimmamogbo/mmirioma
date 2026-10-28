# 2026-10-28: Ports 8000 and 5173 were already in use during the click-through

- **Area:** tooling
- **Author:** Bonvee120 (+ agent)
- **Symptom:** starting `uvicorn app.main:app --port 8000` failed with
  `[winerror 10048] only one usage of each socket address ... is normally
  permitted`, and `npm run dev -- --port 5173 --strictPort` also exited. A
  health check on port 8000 still answered 200, but from an older server that
  was not running this branch's code.
- **Cause:** servers from earlier work were still listening on both ports.
- **Fix / workaround:** check `netstat -ano | grep LISTEN` first, leave servers
  you did not start alone, and run the click-through on free ports (backend
  `--port 8010` with `FRONTEND_URL=http://localhost:5183`, frontend
  `--port 5183` with `VITE_API_BASE_URL=http://localhost:8010`). A 200 from the
  health endpoint does not show which code is running.
- **Status:** workaround
- **Refs:** #165
