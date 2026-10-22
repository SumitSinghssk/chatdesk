from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.security import firewall
from app.modules.admin.security.models import BlockedRequest, IpBlock
from app.modules.admin.security.schemas import DURATIONS, IpBlockCreateSchema
from app.modules.admin.users.models import User
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.request_meta import client_ip

SUBJECT = "ip_block"


def _ip_error(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail={"message": message, "errors": {"ip": [message]}})


def _serialize_block(row: IpBlock, creator: str | None, current) -> dict:
    return {
        "id": row.id,
        "ip": row.ip,
        "reason": row.reason,
        "automatic": bool(row.automatic),
        "expires_at": iso(row.expires_at),
        "expired": bool(row.expires_at and row.expires_at <= current),
        "created_by": {"id": row.created_by, "name": creator} if row.created_by else None,
        "hits": row.hits or 0,
        "last_hit_at": iso(row.last_hit_at),
        "created_at": iso(row.created_at),
    }


def _serialize_request(row: BlockedRequest) -> dict:
    return {
        "id": row.id,
        "ip": row.ip,
        "reason": row.reason,
        "reason_label": firewall.REASONS.get(row.reason, row.reason.replace("_", " ").capitalize()),
        "method": row.method,
        "path": row.path,
        "user_agent": row.user_agent,
        "created_at": iso(row.created_at),
    }


def list_blocks(db: Session, request: Request) -> dict:
    current = now()
    rows = (
        db.query(IpBlock, User.name)
        .outerjoin(User, User.id == IpBlock.created_by)
        .order_by(IpBlock.id.desc())
        .all()
    )
    data = [_serialize_block(row, name, current) for row, name in rows]
    data.sort(key=lambda b: b["expired"])
    return {"status": True, "data": data, "your_ip": client_ip(request)}


def create_block(db: Session, payload: IpBlockCreateSchema, request: Request) -> dict:
    rule = firewall.normalize_rule(payload.ip)
    own_ip = client_ip(request)
    if own_ip and firewall.matches(own_ip, rule):
        raise _ip_error(f"That would block you too (your IP is {own_ip}).")
    if firewall.is_loopback(rule):
        raise _ip_error("That covers this server's own address (127.0.0.1 / ::1), which the website needs.")
    if firewall.active_query(db).filter(IpBlock.ip == rule).first():
        raise _ip_error(f"{rule} is already blocked.")

    user = getattr(request.state, "user", None)
    row = firewall.block(db, rule, payload.reason, DURATIONS[payload.duration], created_by=user.id if user else None)
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id, subject_label=rule,
                 description=f"Blocked {rule}", new_values={"ip": rule, "reason": row.reason,
                                                            "expires_at": iso(row.expires_at)})
    db.commit()
    firewall.flush()
    return {"status": True, "message": f"{rule} is blocked.",
            "data": _serialize_block(row, user.name if user else None, now())}


def delete_block(db: Session, block_id: int, request: Request) -> dict:
    row = db.query(IpBlock).filter(IpBlock.id == block_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Block not found")
    ip = row.ip
    db.delete(row)
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=block_id, subject_label=ip,
                 description=f"Unblocked {ip}")
    db.commit()
    firewall.flush()
    return {"status": True, "message": f"{ip} is unblocked."}


def list_requests(db: Session, page=None, per_page=None, search=None, reason=None) -> dict:
    q = db.query(BlockedRequest)
    term = (search or "").strip()
    if term:
        like = f"%{term}%"
        q = q.filter(or_(BlockedRequest.ip.ilike(like), BlockedRequest.path.ilike(like)))
    if reason:
        q = q.filter(BlockedRequest.reason == reason)
    q = q.order_by(BlockedRequest.id.desc())
    result = list_response(q, _serialize_request, page or 1, per_page or 20, search)

    since = now() - timedelta(days=1)
    counts = dict(
        db.query(BlockedRequest.reason, func.count(BlockedRequest.id))
        .filter(BlockedRequest.created_at >= since)
        .group_by(BlockedRequest.reason)
        .all()
    )
    result["summary"] = {key: int(counts.get(key, 0)) for key in firewall.REASONS} | {
        key: int(value) for key, value in counts.items() if key not in firewall.REASONS
    }
    result["reasons"] = firewall.REASONS
    return result


def clear_requests(db: Session, request: Request) -> dict:
    count = db.query(BlockedRequest).delete(synchronize_session=False)
    log_activity(db, "cleared", request=request, subject_type="blocked_request",
                 description=f"Cleared {count} blocked requests from the log")
    db.commit()
    return {"status": True, "message": f"Cleared {count} blocked request{'s' if count != 1 else ''} from the log."}
