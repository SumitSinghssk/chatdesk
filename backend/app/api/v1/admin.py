from fastapi import APIRouter, Depends

from app.core.admin_auth import require_admin_auth
from app.core.discovery import discover_routers

admin_router = APIRouter(prefix="/admin")
for router in discover_routers("app.modules.admin", "public_router"):
    admin_router.include_router(router)

admin_protected = APIRouter(dependencies=[Depends(require_admin_auth)])
for router in discover_routers("app.modules.admin"):
    admin_protected.include_router(router)

admin_router.include_router(admin_protected)
