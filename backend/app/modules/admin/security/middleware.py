from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from app.modules.admin.security import firewall
from app.shared.utils.request_meta import client_ip

EXEMPT_PATHS = {"/health", "/api/v1/website/firewall"}


async def firewall_middleware(request, call_next):
    if request.url.path not in EXEMPT_PATHS:
        ip = client_ip(request)
        if ip and await run_in_threadpool(firewall.is_blocked, ip):
            await run_in_threadpool(firewall.record_blocked, ip, firewall.REASON_BLOCKED, request)
            return JSONResponse(status_code=403, content={"status": False, "message": "Access denied"})
    return await call_next(request)
