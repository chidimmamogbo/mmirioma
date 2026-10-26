# 2026-10-23: The app's page answered `HEAD` with 405 in the production image

- **Area:** backend
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Checking the #103 image locally, `curl -I
  http://127.0.0.1:8080/driver/sign-in` returned `HTTP/1.1 405 Method Not
  Allowed` with a JSON body, while `GET` returned the page.
- **Cause:** The catch-all route that serves `index.html` was declared with
  `@app.get`; FastAPI does not add `HEAD` to a `GET` route. Uptime monitors
  and link checkers often use `HEAD`.
- **Fix / workaround:** The route takes `GET` and `HEAD` (`app.api_route`),
  with a test. Check new page routes with `curl -I` as well as a browser.
- **Status:** resolved
- **Refs:** #103, `backend/app/core/frontend.py`,
  `backend/tests/test_frontend_serving.py`
