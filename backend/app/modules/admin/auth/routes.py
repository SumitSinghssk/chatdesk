from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.admin_auth import bearer_scheme
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rate_limiter import RateLimit
from app.modules.admin.auth import service
from app.modules.admin.auth.cookies import clear_session_cookies, read_refresh_cookie, require_csrf_header
from app.modules.admin.auth.schemas import (
    ForgotPasswordSchema,
    LoginSchema,
    ResetPasswordSchema,
    TwoFactorChallengeSchema,
)
from app.modules.admin.users.models import User

public_router = APIRouter(prefix="/auth", tags=["Admin Auth"])
protected_router = APIRouter(prefix="/auth", tags=["Admin Auth"])


_csrf = Depends(require_csrf_header)


@public_router.post("/login", dependencies=[Depends(RateLimit(requests=10, window_seconds=60)), _csrf])
def login(payload: LoginSchema, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.login(db, payload.email, payload.password, payload.remember, request, response)


@public_router.post("/two-factor-challenge", dependencies=[Depends(RateLimit(requests=10, window_seconds=60)), _csrf])
def two_factor_challenge(payload: TwoFactorChallengeSchema, request: Request, response: Response,
                         db: Session = Depends(get_db)):
    return service.two_factor_challenge(db, payload.two_factor_token, payload.code, payload.recovery_code,
                                        request, response)


@public_router.post("/refresh", dependencies=[Depends(RateLimit(requests=30, window_seconds=60)), _csrf])
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        return service.refresh_token(db, read_refresh_cookie(request), response)
    except HTTPException as exc:
        if exc.status_code != 401:
            raise
        ended = JSONResponse(status_code=401, content={"status": False, "message": exc.detail, "errors": {}})
        clear_session_cookies(ended)
        return ended


@public_router.post("/logout", dependencies=[_csrf])
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    access = creds.credentials.strip() if creds and creds.credentials else None
    return service.logout(db, request, response, access, read_refresh_cookie(request))


@public_router.post("/forgot-password", dependencies=[Depends(RateLimit(requests=5, window_seconds=60))])
def forgot_password(payload: ForgotPasswordSchema, request: Request, db: Session = Depends(get_db)):
    return service.forgot_password(db, payload.email, request)


@public_router.post("/reset-password", dependencies=[Depends(RateLimit(requests=5, window_seconds=60))])
def reset_password(payload: ResetPasswordSchema, request: Request, db: Session = Depends(get_db)):
    return service.reset_password(db, payload.token, payload.email, payload.password, request)


@protected_router.get("/me")
def me(user: User = Depends(get_current_user)):
    return service.me(user)

router = protected_router
