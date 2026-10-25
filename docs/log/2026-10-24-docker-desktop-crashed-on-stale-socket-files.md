# 2026-10-24: Docker Desktop crashed at start on stale socket files

- **Area:** tooling
- **Author:** Daveoski + Claude Code
- **Symptom:** `docker` commands failed with `failed to connect to the docker
  API at npipe:////./pipe/dockerDesktopLinuxEngine ... The system cannot find
  the file specified.` After starting Docker Desktop (4.83.0, Windows) the
  engine never came up. Its log
  (`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`) said
  `backend crashed ... initializing Inference manager: listening on
  unix://.../Docker/run/dockerInference: remove .../Docker/run/dockerInference:
  The file cannot be accessed by the system.` After that was cleared, the same
  happened for `%LOCALAPPDATA%\docker-secrets-engine\engine.sock`.
- **Cause:** AF_UNIX socket files left behind by an earlier Docker session.
  Windows could not open or delete them ("The file cannot be accessed by the
  system", also from `[System.IO.File]::Delete`), and Docker refuses to start
  when it cannot replace them.
- **Fix / workaround:** Quit Docker Desktop, then rename the folders holding
  the stale sockets instead of deleting the files (renaming the folder works):
  `%LOCALAPPDATA%\Docker\run` and `%LOCALAPPDATA%\docker-secrets-engine`
  (renamed to `*.stale-20261024`). Start Docker Desktop again; it recreates
  them. Check the backend log for another `remove ...: The file cannot be
  accessed` line if it still does not start. Avoid "Reset to factory
  defaults": it deletes images and volumes.
- **Status:** workaround
- **Refs:** #125 (browser click-through)
