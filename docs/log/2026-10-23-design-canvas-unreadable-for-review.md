# 2026-10-23: The driver design canvas could not be read for the G2 review

- **Area:** tooling (design)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Reading the "MmiriOma Driver Deliveries" canvas
  (`https://claude.ai/artifact/TSk9TpHitmikb8uxkWAuWe`) with the agent's
  artifact read returned only "Design" and "Loading…": no artboards or
  frames, so A1-A8 and P-a to P-q could not be checked frame by frame.
- **Cause:** The canvas renders its boards in the browser; the read gets the
  page before that happens. Only the file version (`1792748528-aeca`) was
  visible.
- **Fix / workaround:** The G2 approvals of 2026-10-23 (A1-A8, #109) were
  made on the design records in `docs/design/driver-deliveries.md` and the
  prompts, checked against the SRS, and the records say the frames were not
  inspected. For a frame-by-frame check, open the canvas in a browser, or
  export the board's HTML or screenshots into `docs/design/assets/`.
- **Status:** workaround
- **Refs:** #97, #109, `docs/design/driver-deliveries.md`
