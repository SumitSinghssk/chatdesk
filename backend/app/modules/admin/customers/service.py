from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.security import hash_password
from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.customers.schemas import CustomerCreateSchema, CustomerUpdateSchema
from app.modules.admin.settings.service import get_group
from app.modules.customer.account.models import Customer, CustomerSession
from app.modules.customer.whatsapp.models import WhatsAppAccount
from app.services.sms import normalize_phone
from app.services.sms import config as sms_config
from app.shared.enums import Status
from app.shared.pagination import list_response
from app.shared.utils.bulk import BulkActionSchema
from app.shared.utils.datetime import days_ago_start, iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.request_meta import describe_agent
from app.shared.utils.search import search_clause

SUBJECT = "customer"
METHODS = ("password", "otp", "google", "admin")
WHATSAPP_STATES = ("connected", "error", "not_connected")


def _label(row: Customer) -> str:
    return row.business_name or row.name or row.email or row.phone or f"Customer #{row.id}"


def _whatsapp(row: Customer) -> dict:
    account: WhatsAppAccount | None = row.whatsapp_account
    if account is None:
        return {"status": "not_connected", "display_phone_number": None, "verified_name": None,
                "quality_rating": None, "last_event_at": None}
    return {"status": "connected" if account.status == "connected" else "error",
            "display_phone_number": account.display_phone_number, "verified_name": account.verified_name,
            "quality_rating": account.quality_rating, "last_event_at": iso(account.last_event_at)}


def _team_size(row: Customer) -> int:
    from sqlalchemy.orm import object_session

    db = object_session(row)
    return (db.query(func.count(Customer.id)).filter(Customer.workspace_id == row.id, Customer.not_deleted())
            .scalar() or 0) if db else 0


def _serialize(row: Customer) -> dict:
    return {
        "id": row.id,
        "team_members": _team_size(row),
        "name": row.name,
        "business_name": row.business_name,
        "email": row.email,
        "phone": row.phone,
        "avatar": row.avatar,
        "status": row.status,
        "signup_method": row.signup_method,
        "whatsapp": _whatsapp(row),
        "has_password": bool(row.password),
        "google_linked": bool(row.google_id),
        "email_verified_at": iso(row.email_verified_at),
        "phone_verified_at": iso(row.phone_verified_at),
        "last_login_at": iso(row.last_login_at),
        "last_login_ip": row.last_login_ip,
        "last_login_method": row.last_login_method,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def _snapshot(row: Customer) -> dict:
    return {"name": row.name, "business_name": row.business_name, "email": row.email, "phone": row.phone,
            "status": row.status,
            "password": "••••••" if row.password else None}


def _get_or_404(db: Session, customer_id: int) -> Customer:
    row = db.query(Customer).filter(Customer.id == customer_id, Customer.not_deleted()).first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    return row


def _error(status: int, field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"message": message, "errors": {field: [message]}})


def _revoke_sessions(db: Session, customer_id: int) -> int:
    return db.query(CustomerSession).filter(
        CustomerSession.customer_id == customer_id, CustomerSession.revoked_at.is_(None)
    ).update({"revoked_at": now()}, synchronize_session=False)


def _apply(db: Session, row: Customer, payload: CustomerCreateSchema | CustomerUpdateSchema) -> None:
    email = str(payload.email).lower() if payload.email else None
    phone = None
    if payload.phone:
        phone = normalize_phone(payload.phone, sms_config.load(db)["default_country_code"])
        if not phone:
            raise _error(422, "phone", "Enter a valid mobile number")
    if not email and not phone and not row.google_id:
        raise _error(422, "email", "Add an email or a mobile number")
    others = db.query(Customer.id).filter(Customer.not_deleted(), Customer.id != (row.id or 0))
    if email and others.filter(func.lower(Customer.email) == email).first():
        raise _error(409, "email", "Another customer already uses this email")
    if phone and others.filter(Customer.phone == phone).first():
        raise _error(409, "phone", "Another customer already uses this mobile number")
    if payload.password:
        length = int(get_group(db, "security").get("password_min_length", 8))
        if len(payload.password) < length:
            raise _error(422, "password", f"Password must be at least {length} characters")
        row.password = hash_password(payload.password)
    if email != row.email:
        row.email_verified_at = None
    if phone != row.phone:
        row.phone_verified_at = None
    row.name = payload.name.strip()
    row.email = email
    row.phone = phone
    row.business_name = payload.business_name.strip() if payload.business_name else None
    row.status = payload.status.value


GRID_FIELDS = {
    "name": GridField(Customer.name, "text"),
    "business_name": GridField(Customer.business_name, "text"),
    "email": GridField(Customer.email, "text"),
    "phone": GridField(Customer.phone, "text"),
    "status": GridField(Customer.status, "enum"),
    "signup_method": GridField(Customer.signup_method, "enum"),
    "last_login_method": GridField(Customer.last_login_method, "enum"),
    "has_password": GridField(Customer.password.isnot(None), "bool", sortable=False),
    "google_linked": GridField(Customer.google_id.isnot(None), "bool", sortable=False),
    "phone_verified": GridField(Customer.phone_verified_at.isnot(None), "bool", sortable=False),
    "last_login_at": GridField(Customer.last_login_at, "date"),
    "created_at": GridField(Customer.created_at, "date"),
    "updated_at": GridField(Customer.updated_at, "date"),
}


def list_customers(db: Session, page=None, per_page=None, search=None, status=None, method=None,
                   filters: str | None = None, match: str | None = "and", sort: str | None = None,
                   whatsapp: str | None = None):
    q = (db.query(Customer).options(selectinload(Customer.whatsapp_account))
         .filter(Customer.not_deleted(), Customer.workspace_id.is_(None), Customer.parent_id.is_(None)))
    clause = search_clause([Customer.name, Customer.business_name, Customer.email, Customer.phone], search)
    if clause is not None:
        q = q.filter(clause)
    if status:
        q = q.filter(Customer.status == status)
    if method:
        q = q.filter(Customer.signup_method == method)
    if whatsapp in WHATSAPP_STATES:
        q = q.filter(_whatsapp_clause(whatsapp))
    q = apply_filters(q, GRID_FIELDS, filters, match)
    q = apply_sort(q, GRID_FIELDS, sort, [Customer.id.desc()])
    return list_response(q, _serialize, page, per_page, search)


def _whatsapp_clause(state: str):
    has_account = Customer.whatsapp_account.has()
    if state == "connected":
        return Customer.whatsapp_account.has(WhatsAppAccount.status == "connected")
    if state == "error":
        return Customer.whatsapp_account.has(WhatsAppAccount.status != "connected")
    return ~has_account


def stats(db: Session):
    current = now()
    week_start = days_ago_start(6)

    def count(*filters) -> int:
        return db.query(func.count(Customer.id)).filter(Customer.not_deleted(), Customer.workspace_id.is_(None),
                                                       Customer.parent_id.is_(None), *filters).scalar() or 0

    methods = dict(db.query(Customer.signup_method, func.count(Customer.id))
                   .filter(Customer.not_deleted(), Customer.workspace_id.is_(None), Customer.parent_id.is_(None))
                   .group_by(Customer.signup_method).all())
    return {
        "status": True,
        "data": {
            "total": count(),
            "active": count(Customer.status == Status.ACTIVE.value),
            "inactive": count(Customer.status == Status.INACTIVE.value),
            "active_30d": count(Customer.last_login_at >= current - timedelta(days=30)),
            "phone_verified": count(Customer.phone_verified_at.isnot(None)),
            "methods": {m: methods.get(m, 0) for m in METHODS},
            "whatsapp": {state: count(_whatsapp_clause(state)) for state in WHATSAPP_STATES},
            "this_week": count(Customer.created_at >= week_start),
            "last_week": count(Customer.created_at >= week_start - timedelta(days=7),
                               Customer.created_at < week_start),
        },
    }


def get_customer(db: Session, customer_id: int):
    row = _get_or_404(db, customer_id)
    sessions = (db.query(CustomerSession)
                .filter(CustomerSession.customer_id == row.id, CustomerSession.revoked_at.is_(None),
                        CustomerSession.expires_at > now())
                .order_by(CustomerSession.last_active_at.desc()).limit(20).all())
    return {"status": True, "data": {
        **_serialize(row),
        "sessions": [{"id": s.id, "method": s.method, "ip_address": s.ip_address, **describe_agent(s.user_agent),
                      "created_at": iso(s.created_at), "last_active_at": iso(s.last_active_at)} for s in sessions],
    }}


def create_customer(db: Session, payload: CustomerCreateSchema, request: Request):
    row = Customer(signup_method="admin")
    _apply(db, row, payload)
    db.add(row)
    db.flush()
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Customer added", "data": _serialize(row)}


def update_customer(db: Session, customer_id: int, payload: CustomerUpdateSchema, request: Request):
    row = _get_or_404(db, customer_id)
    before = _snapshot(row)
    old_hash = row.password
    _apply(db, row, payload)
    old, new = diff(before, _snapshot(row))
    if row.password != old_hash:
        old["password"], new["password"] = before["password"], "•••••• (new value)"
        _revoke_sessions(db, row.id)
    if row.status != Status.ACTIVE.value:
        _revoke_sessions(db, row.id)
    log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Customer updated", "data": _serialize(row)}


def toggle_status(db: Session, customer_id: int, request: Request):
    row = _get_or_404(db, customer_id)
    before = row.status
    row.status = Status.INACTIVE.value if row.status == Status.ACTIVE.value else Status.ACTIVE.value
    if row.status == Status.INACTIVE.value:
        _revoke_sessions(db, row.id)
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), old_values={"status": before}, new_values={"status": row.status})
    db.commit()
    return {"status": True, "message": f"Customer {row.status}", "data": _serialize(row)}


def revoke_sessions(db: Session, customer_id: int, request: Request):
    row = _get_or_404(db, customer_id)
    count = _revoke_sessions(db, row.id)
    log_activity(db, "sessions_revoked", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), description=f"Signed out {count} device{'s' if count != 1 else ''}")
    db.commit()
    return {"status": True, "message": f"Signed out of {count} device{'s' if count != 1 else ''}"}


def delete_customer(db: Session, customer_id: int, request: Request):
    row = _get_or_404(db, customer_id)
    row.deleted_at = now()
    _revoke_sessions(db, row.id)
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=_label(row), description="Moved to trash", old_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Customer moved to trash"}


def bulk_action(db: Session, payload: BulkActionSchema, request: Request):
    rows = db.query(Customer).filter(Customer.id.in_(payload.ids), Customer.not_deleted()).all()
    statuses = {r.id: r.status for r in rows}
    snapshots = {r.id: _snapshot(r) for r in rows} if payload.action == "delete" else {}
    for row in rows:
        if payload.action == "delete":
            row.deleted_at = now()
        else:
            row.status = Status.ACTIVE.value if payload.action == "activate" else Status.INACTIVE.value
        if payload.action != "activate":
            _revoke_sessions(db, row.id)
    log_bulk(db, payload.action, rows, request=request, subject_type=SUBJECT, label=_label,
             statuses=statuses, snapshots=snapshots)
    db.commit()
    return {"status": True, "message": f"{len(rows)} customers updated"}
