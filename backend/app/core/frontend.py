"""Serve the built frontend from the API, so both share one origin.

On Railway the app runs as a single service: the frontend (``npm run build``
output) and ``/api`` must share one origin, because ``up.railway.app`` is on
the Public Suffix List and a session cookie set for one service's address
would not reach another (technical lead, #103; docs/architecture/deployment.md).

Only mounted when ``FRONTEND_DIST_DIR`` is set (production image). In
development and tests Vite serves the frontend and nothing here runs.

What is served, after every API route:

- ``/assets/...``: Vite's hashed bundles, cached for a year (their names
  change whenever their content does).
- Any other existing file in the build (``favicon.svg``): as is, revalidated.
- Every other ``GET`` or ``HEAD`` outside ``/api``: ``index.html``, never cached, so the
  React router handles the path and a new release is picked up on the next
  load.
- ``/api/...`` paths that match no route: the API's own 404 error envelope,
  never the HTML page.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.types import Scope

#: Hashed bundles never change under the same name.
IMMUTABLE = "public, max-age=31536000, immutable"
#: The page and the other files are checked with the server on every load.
REVALIDATE = "no-cache"


class _ImmutableStaticFiles(StaticFiles):
    """``StaticFiles`` that marks every file it serves as immutable."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = IMMUTABLE
        return response


def _inside(root: Path, candidate: Path) -> bool:
    # Resolve both, so "../" and symlinks cannot reach outside the build.
    try:
        candidate.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def mount_frontend(app: FastAPI, dist_dir: Path) -> None:
    """Serve the built frontend at ``/``, after every API route.

    Call after ``app.include_router(api_router)``: routes match in the order
    they are added, so the catch-all below never hides an API route.

    Args:
        app: The application.
        dist_dir: The build folder; it contains ``index.html`` (checked by the
            settings).
    """
    index = dist_dir / "index.html"
    assets = dist_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", _ImmutableStaticFiles(directory=assets), name="frontend-assets")

    # HEAD too: uptime monitors and link checkers often ask for the page that way.
    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def frontend(full_path: str) -> Response:
        if full_path == "api" or full_path.startswith("api/"):
            # An unknown API path keeps the JSON 404 envelope (app.core.errors).
            raise StarletteHTTPException(status_code=404)
        candidate = dist_dir / full_path
        if full_path and _inside(dist_dir, candidate) and candidate.is_file():
            return FileResponse(candidate, headers={"Cache-Control": REVALIDATE})
        return FileResponse(index, headers={"Cache-Control": REVALIDATE})
