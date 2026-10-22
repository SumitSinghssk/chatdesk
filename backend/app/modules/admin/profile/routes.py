from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_session_id
from app.core.rate_limiter import RateLimit
from app.modules.admin.profile import service
from app.modules.admin.profile.schemas import (
    ChangePasswordSchema,
    PasswordConfirmSchema,
    ProfileUpdateSchema,
    TwoFactorCodeSchema,
)
from app.modules.admin.users.models import User

router = APIRouter(prefix="/profile", tags=["Admin Profile"])

_secret_check_limit = [Depends(RateLimit(requests=5, window_seconds=60))]


@router.get("/")
def show(user: User = Depends(get_current_user)):
    return service.show(user)


@router.put("/")
def update(payload: ProfileUpdateSchema, request: Request, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    return service.update(db, user, payload, request)


@router.post("/avatar")
def upload_avatar(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    return service.upload_avatar(db, user, file, request)


@router.delete("/avatar")
def delete_avatar(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.delete_avatar(db, user, request)


@router.put("/password", dependencies=_secret_check_limit)
def change_password(
    payload: ChangePasswordSchema,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    session_id: str = Depends(get_session_id),
):
    return service.change_password(db, user, session_id, payload, request, response)


@router.get("/sessions")
def sessions(db: Session = Depends(get_db), user: User = Depends(get_current_user),
             session_id: str = Depends(get_session_id)):
    return service.list_sessions(db, user, session_id)


@router.delete("/sessions")
def revoke_other_sessions(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user),
                          session_id: str = Depends(get_session_id)):
    return service.revoke_other_sessions(db, user, session_id, request)


@router.delete("/sessions/{target_id}")
def revoke_session(target_id: str, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user), session_id: str = Depends(get_session_id)):
    return service.revoke_session(db, user, session_id, target_id, request)


@router.get("/two-factor")
def two_factor_status(user: User = Depends(get_current_user)):
    return service.two_factor_status(user)


@router.post("/two-factor/setup")
def two_factor_setup(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.two_factor_setup(db, user)


@router.post("/two-factor/confirm", dependencies=_secret_check_limit)
def two_factor_confirm(payload: TwoFactorCodeSchema, request: Request, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    return service.two_factor_confirm(db, user, payload.code, request)


@router.post("/two-factor/recovery-codes", dependencies=_secret_check_limit)
def regenerate_recovery_codes(payload: PasswordConfirmSchema, request: Request, db: Session = Depends(get_db),
                              user: User = Depends(get_current_user)):
    return service.regenerate_recovery_codes(db, user, payload.password, request)


@router.delete("/two-factor", dependencies=_secret_check_limit)
def two_factor_disable(payload: PasswordConfirmSchema, request: Request, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    return service.two_factor_disable(db, user, payload.password, request)
