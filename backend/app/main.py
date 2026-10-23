import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, status
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import DataError, IntegrityError, OperationalError
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

from app import models  # noqa: F401
from app.api.v1 import api_router
from app.core.config import DEFAULT_APP_NAME, STORAGE_DIR, settings
from app.core.exceptions import (
    data_error_handler,
    global_exception_handler,
    http_exception_handler,
    integrity_error_handler,
    operational_error_handler,
    validation_exception_handler,
)
from app.core.logging_config import configure_logging
from app.core.monitoring import init_sentry
from app.core.security_headers import add_security_headers
from app.core.static_files import UploadStaticFiles
from app.modules.admin.security.middleware import firewall_middleware
from app.modules.customer.ai_agent import engine as ai_engine
from app.modules.customer.campaigns import runner as campaign_runner
from app.modules.customer.chatbots import engine as chatbot_engine

configure_logging()
init_sentry("api")

if settings.is_production and not settings.INTERNAL_API_KEY:
    logging.getLogger(__name__).warning(
        "INTERNAL_API_KEY is not set: GET /api/v1/website/firewall is public. Set it in the API and frontend .env."
    )



@asynccontextmanager
async def lifespan(_: FastAPI):
    campaign_runner.start_ticker()  # sends scheduled campaigns and resumes interrupted ones
    chatbot_engine.start_ticker()  # carries chatbots on after a delay, closes ones customers left
    ai_engine.start_ticker()  # answers WhatsApp chats with the AI agent, off the webhook's back
    yield


app = FastAPI(
    lifespan=lifespan,
    title=f"{DEFAULT_APP_NAME} API",
    version="1.0.0",
    openapi_url=None if settings.is_production else "/openapi.json",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
)


class RequestSizeLimitMiddleware:

    def __init__(self, app, max_json_size: int, max_upload_size: int):
        self.app = app
        self.max_json_size = max_json_size
        self.max_upload_size = max_upload_size

    @staticmethod
    def _too_large(limit: int) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            content={"status": False, "message": f"Request exceeds the {limit // (1024 * 1024)} MB limit", "errors": {}},
        )

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = Headers(scope=scope)
        is_json = "application/json" in headers.get("content-type", "")
        limit = self.max_json_size if is_json else self.max_upload_size
        length = headers.get("content-length")
        if length and length.isdigit():
            if int(length) > limit:
                return await self._too_large(limit)(scope, receive, send)
            return await self.app(scope, receive, send)

        received = 0
        exceeded = False
        replaced = False

        async def limited_receive():
            nonlocal received, exceeded
            if exceeded:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    return {"type": "http.disconnect"}
            return message

        started = False

        async def guarded_send(message):
            nonlocal replaced, started
            if message["type"] == "http.response.start" and not exceeded:
                started = True
            if exceeded and not started:
                if not replaced:
                    replaced = True
                    await self._too_large(limit)(scope, receive, send)
                return
            await send(message)

        await self.app(scope, limited_receive, guarded_send)
        if exceeded and not replaced and not started:
            await self._too_large(limit)(scope, receive, send)


app.middleware("http")(firewall_middleware)
app.add_middleware(RequestSizeLimitMiddleware, max_json_size=1 * 1024 * 1024, max_upload_size=11 * 1024 * 1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
)
app.middleware("http")(add_security_headers)

app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(IntegrityError, integrity_error_handler)
app.add_exception_handler(DataError, data_error_handler)
app.add_exception_handler(OperationalError, operational_error_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

app.include_router(api_router)

UPLOADS_DIR = STORAGE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/storage/uploads", UploadStaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/", include_in_schema=False)
def root():
    return {"status": True, "message": f"{DEFAULT_APP_NAME} API is running", "docs": "/docs"}


@app.get("/health", include_in_schema=False)
def health():
    return {"status": True}
