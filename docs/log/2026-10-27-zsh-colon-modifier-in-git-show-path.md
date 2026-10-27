# 2026-10-27: zsh read `$M:PRIVACY_NOTICE.md` as a path modifier

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `git show $M:PRIVACY_NOTICE.md` (with `M=origin/main`) failed
  with `fatal: ambiguous argument '/home/.../origin/mainRIVACY_NOTICE.md': unknown revision or path not in the working tree.`
  In the same session `for b in $order` ran once with the whole string,
  because zsh does not split unquoted variables.
- **Cause:** in zsh, `$var:P` is a modifier (here `:P`, the absolute path),
  so `$M:PRIVACY...` became a path. zsh also does not word-split `$var` the
  way Bash does.
- **Fix / workaround:** write `"${M}:path"` (braces, quoted) in `git show`
  and `git grep`, and `${=var}` (or an array) when a loop needs splitting.
  Scripts meant for Bash run under `bash` are not affected.
- **Status:** resolved
- **Refs:** PR #106 review, #102.
