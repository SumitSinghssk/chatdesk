from fastapi import APIRouter

from app.api.v1.admin import admin_router
from app.api.v1.customer import customer_router
from app.api.v1.website import website_router

V1_PREFIX = "/api/v1"

api_router = APIRouter(prefix=V1_PREFIX)
api_router.include_router(admin_router)
api_router.include_router(website_router)
api_router.include_router(customer_router)

__all__ = ["api_router", "V1_PREFIX"]
