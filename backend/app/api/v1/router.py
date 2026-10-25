"""Aggregates every version 1 router under the ``/api/v1`` prefix.

Business modules add their routers here, e.g. ``api_router.include_router(orders.router)``.
"""

from fastapi import APIRouter

from app.api.v1 import health
from app.modules.auth import router as auth
from app.modules.deliveries import admin_router as admin_orders
from app.modules.deliveries import router as deliveries
from app.modules.dispatch import router as dispatch
from app.modules.orders import router as orders
from app.modules.payments import router as payments

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(orders.router)
api_router.include_router(deliveries.router)
api_router.include_router(dispatch.router)
api_router.include_router(admin_orders.router)
api_router.include_router(payments.router)
