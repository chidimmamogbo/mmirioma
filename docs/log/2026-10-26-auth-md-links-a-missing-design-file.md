# 2026-10-26: auth.md links to a design file the fork does not have

- **Area:** process
- **Author:** Bonvee120 + Claude Code
- **Symptom:** While checking links for #47, `docs/api/auth.md` points twice
  to `../design/phone-verification.md` (the "Phone verification" status note
  and open question 2). The file does not exist in the fork: `docs/design/`
  has no `phone-verification.md`.
- **Cause:** `auth.md` was copied from the main repo, where that design
  lives. The fork replaced the main repo's designs with the new-design
  handoff (`docs/design/handoff-v1.md`) and did not copy that file.
- **Fix / workaround:** None in #47, which only amends the partner rules.
  Either copy the design from the main repo or point the links at the
  fork's phone verification screens, in its own small PR for lane A (#6).
- **Status:** open
- **Refs:** #47, `docs/api/auth.md`
