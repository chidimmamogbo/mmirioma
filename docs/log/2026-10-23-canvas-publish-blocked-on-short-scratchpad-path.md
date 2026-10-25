# 2026-10-23: Publishing a canvas from the scratchpad was blocked on its short Windows path

- **Area:** tooling (design)
- **Author:** Daveoski + Claude Code
- **Symptom:** Publishing the new "MmiriOma Customer Pilot Status" canvas
  (#99) failed: `files: publishing "C:\Users\ORJION~1\AppData\Local\Temp\
  claude\...\scratchpad\canvas-99\project\canvas.json" is blocked by a Read
  permission rule`. The retry was then refused because the page had already
  written its own empty `project/canvas.json` when the canvas was created.
- **Cause:** The scratchpad path was given in its 8.3 short form
  (`ORJION~1`), which the permission rules do not match; the same folder
  under its long form (`C:\Users\Orjionuchie\...`) is allowed. A new canvas
  saves an empty index from its page right away, so the agent's first index
  must be merged onto it.
- **Fix / workaround:** Publish with the long path for `root` and
  `file_path`. Read `project/canvas.json` first and keep its keys
  (`attachments`, `createdOnFiles`) when writing the index.
- **Status:** resolved
- **Refs:** #99, `docs/design/customer-pilot-status.md`
