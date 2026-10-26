# 2026-10-23: Git Bash's path sent the Docker backup into Docker's own VM

- **Area:** tooling
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Testing `deploy/backup.sh` in Docker mode on Windows, the
  script printed `Backup written: /tmp/claude/.../backups-103/mmirioma-....dump`
  and its own `pg_restore --list` check passed, but the folder on Windows was
  empty: `ls: cannot access '.../mmirioma-*.dump': No such file or directory`.
- **Cause:** In Git Bash, `pwd` of the Windows temp folder is `/tmp/...`. With
  `MSYS_NO_PATHCONV=1`, `docker run -v /tmp/...:/backups` mounted a folder
  inside Docker Desktop's Linux VM, not the Windows folder, so the dump was
  written there.
- **Fix / workaround:** Both scripts mount `pwd -W` (the Windows form) when it
  exists, else `pwd`. Retested: the dump appears on the host and restores.
  When a script passes a host folder to `docker run -v` from Git Bash, use the
  Windows path.
- **Status:** resolved
- **Refs:** #103, `deploy/backup.sh`, `deploy/restore.sh`
