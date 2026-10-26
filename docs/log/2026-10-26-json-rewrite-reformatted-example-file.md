# 2026-10-26: Rewriting an example with json.dumps reformatted the whole file

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** changing one field in `docs/api/examples/admin-service-zones.json`
  with `json.load` / `json.dumps(indent=2)` expanded every inline object and
  the polygon coordinates onto one value per line, turning a one-field
  change into a diff of the whole file.
- **Cause:** the example files are hand-formatted with inline objects;
  `json.dumps` has no option to keep that layout.
- **Fix / workaround:** rewrote the file by hand in its original layout.
  Edit example JSON as text, then check it parses
  (`python3 -c "import json,sys; json.load(open(sys.argv[1]))" <file>`).
- **Status:** resolved
- **Refs:** #30, `docs/api/examples/admin-service-zones.json`
