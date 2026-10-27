# 2026-10-27: A dev server from an old worktree served stale code during a click-through

- **Area:** tooling
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** in the #80 click-through, the sign-up screen still showed
  "We do not serve "Abakpa" yet. …" as its top notice, although the new code
  puts it under the area field and its tests passed. Port 5173 was served by
  Vite from `../wt-67/frontend`, a worktree made to fix PR #69. After Ctrl+C
  in its terminal, its `node` process (`vite.js`) kept running, and
  `git worktree remove ../wt-67` then failed with
  `error: failed to delete 'C:/Users/BN/Desktop/mmirioma_forked/wt-67': Invalid argument`.
- **Cause:** the new frontend was never started, because 5173 was taken by
  the old server. Ctrl+C stopped the `cmd /c vite` wrapper but not its
  `node` child, which kept files in the worktree open.
- **Fix / workaround:** find who owns the port before a click-through
  (`Get-NetTCPConnection -LocalPort 5173 -State Listen`, then the process's
  command line). Stop a leftover `node` with `Stop-Process -Id <pid>`, then
  remove the worktree. Git had already unregistered it; the leftover folder
  was deleted with `Remove-Item -Recurse` once nothing held it.
- **Status:** resolved
- **Refs:** #80, PR #69
