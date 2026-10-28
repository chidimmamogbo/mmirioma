# 2026-10-28: Local database port reserved by Windows

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** after Docker Desktop restarted, a local Postgres container
  would not start: `ports are not available: exposing port TCP
  127.0.0.1:55432 ... bind: An attempt was made to access a socket in a way
  forbidden by its access permissions.`
- **Cause:** Windows reserves TCP port ranges (Hyper-V and WinNAT), and the
  ranges change on restart. 55432 fell inside 55395-55494 (`netsh interface
  ipv4 show excludedportrange protocol=tcp`). A container's port cannot be
  changed after it is created.
- **Fix / workaround:** check the reserved ranges first, then start a new
  container on the same data volume and a free port, e.g.
  `docker run -d -p 127.0.0.1:54331:5432 -v <volume>:/var/lib/postgresql/data
  postgis/postgis:16-3.4` (`docker inspect <old> --format '{{range .Mounts}}{{.Name}}{{end}}'`
  gives the volume). The data is kept. Next time, pick a port below 50000.
- **Status:** workaround
- **Refs:** #155
