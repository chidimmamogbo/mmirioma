# 2026-10-29: Browser screenshots time out while a heavy test run is going

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** During click-throughs (#176, #204) the Chrome automation failed
  with `CDP sendCommand "Page.captureScreenshot" timed out after 30000ms on
  tab ... The renderer may be frozen or unresponsive.` The page itself still
  answered text reads and element lookups (`get_page_text`, `read_page`,
  `find`).
- **Cause:** Not found. It happened both times while the machine was busy (the
  full backend suite, or the Vite dev server compiling); once the load ended,
  the same tab worked.
- **Fix / workaround:** Do not run the full backend suite while clicking
  through. If a screenshot times out, read the page with `get_page_text` or
  `read_page` and click by element reference instead of by coordinates, then
  retry the screenshot after the run ends.
- **Status:** workaround
- **Refs:** #176, #204
