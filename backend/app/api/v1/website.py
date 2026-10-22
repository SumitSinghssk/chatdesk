from fastapi import APIRouter

from app.core.discovery import discover_routers

website_router = APIRouter(prefix="/website", tags=["Website"])
for router in discover_routers("app.modules.website"):
    website_router.include_router(router)
