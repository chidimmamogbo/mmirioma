# MmiriOma production image: the API and the built frontend on one origin.
#
# Build context: the repository root (railway.json; locally
# `docker build -f backend/Dockerfile .`). See docs/architecture/deployment.md.

# --- Stage 1: build the frontend ------------------------------------------------
FROM node:24-bookworm-slim AS frontend

# Public value baked into the bundle at build time: the app's own https origin,
# e.g. https://mmirioma-production.up.railway.app (Railway passes service
# variables to the build only when declared with ARG). Never a secret.
ARG VITE_API_BASE_URL
ARG VITE_SUPPORT_PHONE=
ARG VITE_SUPPORT_WHATSAPP=
RUN test -n "$VITE_API_BASE_URL" || (echo "Set the VITE_API_BASE_URL build variable" >&2 && exit 1)

WORKDIR /repo/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# The build reads the privacy notice (vite.config.ts) and type-checks tests that
# import the API examples, both outside frontend/.
COPY PRIVACY_NOTICE.md /repo/PRIVACY_NOTICE.md
COPY docs/api/examples /repo/docs/api/examples
ENV VITE_ORDERS_SOURCE=api
RUN npm run build

# --- Stage 2: the API -------------------------------------------------------------
FROM python:3.14-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    FRONTEND_DIST_DIR=/app/frontend_dist

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY backend/scripts/start.sh ./start.sh
COPY --from=frontend /repo/frontend/dist ./frontend_dist

# Never run as root.
RUN useradd --create-home --uid 10001 mmirioma && chmod 0755 start.sh
USER mmirioma

# Railway injects PORT; 8000 locally.
ENV PORT=8000
EXPOSE 8000
CMD ["./start.sh"]
