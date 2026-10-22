from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_permission
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.modules.admin.dashboard import service
from app.modules.admin.users.models import User
from app.shared.constants import permissions as P

router = APIRouter(prefix="/dashboard", tags=["Admin Dashboard"])


@router.get("/", dependencies=[Depends(require_admin_permission(P.DASHBOARD_VIEW))])
def index(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.overview(db, user)
