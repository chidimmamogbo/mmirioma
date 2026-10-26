# 2026-10-26: Admin directory mocks disagree with the SRS and other issues

- **Area:** process
- **Author:** Cloudcrackamara (+ Claude Code)
- **Symptom:** writing the #18 contract from `frontend/src/mocks/adminMock.ts`
  found rules and fields the SRS does not support, and scope shared with
  other issues:
  1. The price list prices water per can and per tank, with fee switches,
     rider pay and a points rule; SRS FR-022 prices by rates, and #10 (PR #28)
     decided FR-022 only.
  2. Service areas take an admin-typed distance and no coordinates; FR-010
     needs coordinates and FR-022 takes distance from OSRM only.
  3. Staff can mark a phone verified after a call; FR-003 verifies by SMS
     code, which is built.
  4. Rider approval has `pending`; FR-002 has active and inactive only.
  5. Points (#11), partner sign-up (#14) and zones (#30) overlap #18.
- **Cause:** the design and mocks were built before SRS v0.3 settled pricing
  and zones, and the issues were split by screen, not by backend record.
- **Fix / workaround:** decided with the lane owner before writing: FR-022
  rates; zones written in #18 (comment on #30); no rider pay or points; no
  staff verification; FR-002 activation; no source endpoints. The rest are
  open questions in `docs/api/admin-directory.md`.
- **Status:** resolved
- **Refs:** #18, #10, #11, #14, #30, `docs/api/admin-directory.md`
