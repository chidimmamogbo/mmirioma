# 2026-10-27: The demo seed hangs without a console

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** Setting up a local backend for #9's live check,
  `python -m app.modules.demo.seed` never returned when run from an agent's
  shell. It was stopped after 10 minutes, with nothing seeded. Docker
  Desktop was also not at the usual `C:\Program Files\Docker\Docker`, so
  starting it by that path failed.
- **Cause:** The seed reads the demo password with `getpass.getpass`, which
  on Windows reads the console directly and ignores standard input (as for
  `auth.cli create-user`, LOG.md 2026-10-22). This was already recorded in
  LOG.md's #114 entry, but a search for "click-through" did not find it.
  Docker Desktop was a per-user install under
  `%LOCALAPPDATA%\Programs\DockerDesktop`.
- **Fix / workaround:** For a throwaway database, call the seed's own `main()`
  with the prompt replaced:
  `python -c "import getpass; getpass.getpass = lambda p='': '<local pw>'; from app.modules.demo.seed import main; raise SystemExit(main())"`.
  For a shared or real database, run the seed in an interactive terminal.
  Find Docker Desktop with `Get-ChildItem $env:LOCALAPPDATA\Programs -Filter
  "Docker Desktop.exe" -Recurse -Depth 3`. Search the log for the command
  name (`grep -ril "demo.seed\|getpass" docs/log LOG.md`), not only for the
  task.
- **Status:** workaround
- **Refs:** #9, PR #76, LOG.md (#114 entry, 2026-10-22 `create-user` entry)
