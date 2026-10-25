# 2026-10-24: Port 8000 taken over IPv6, Vite through a linked `node_modules`, and two setup-script mistakes

- **Area:** tooling
- **Author:** Daveoski + Claude Code
- **Symptom:** Setting up #125's browser click-through on Windows:
  1. `POST http://localhost:8000/api/v1/auth/login` answered 422
     `{"error": {"code": "VALIDATION_ERROR", "message": "email: Field
     required", ...}}`, which is not this API's error envelope, although
     uvicorn said `Uvicorn running on http://127.0.0.1:8000`.
  2. With `frontend/node_modules` a junction to another checkout's, the page
     stayed blank: the browser got `504 (Outdated Optimize Dep)` and Vite
     logged `error while updating dependencies: Error: ENOENT: no such file or
     directory, mkdir '...\frontend\node_modules\.vite\deps_temp_...'`.
  3. The setup script's pickup was refused: 422 `picked_up_at`: "Pickup time
     cannot be before the job started".
  4. Its proof was refused: 400 `delivery_code_invalid`.
- **Cause:**
  1. Another project's Docker container published `[::]:8000`. `localhost`
     resolved to `::1` first, so requests went to that container, not to
     uvicorn on `127.0.0.1`.
  2. Vite writes its dependency cache under `node_modules/.vite`; through the
     junction the path did not resolve.
  3. The script sent the pickup time truncated to whole seconds in the same
     second the job started, so it was earlier than the start.
  4. The script read the delivery code from the mock SMS log with a pattern
     that matched the six digits of the masked phone number first.
- **Fix / workaround:**
  1. Check the port first (`Get-NetTCPConnection -LocalPort 8000 -State
     Listen` in PowerShell, or `netstat -ano`). Run the API on a free port
     (`uvicorn app.main:app --port 8125`) and set
     `VITE_API_BASE_URL=http://localhost:8125`.
  2. Run `npm ci` in the worktree instead of linking `node_modules`. Remove
     a junction with `[System.IO.Directory]::Delete(path, $false)`, never
     `rm -rf`, which can follow it into the target.
  3. Wait two seconds after `departed` before sending the pickup.
  4. Match the text: `delivery code is (\d{6})`.
- **Status:** workaround
- **Refs:** #125, `docs/features/cash-remittance.md` (browser click-through)
