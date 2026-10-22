from fastapi import APIRouter

from app.core.discovery import discover_routers

customer_router = APIRouter(prefix="/customer")
for router in discover_routers("app.modules.customer", "public_router"):
    customer_router.include_router(router)
for router in discover_routers("app.modules.customer"):
    customer_router.include_router(router)
