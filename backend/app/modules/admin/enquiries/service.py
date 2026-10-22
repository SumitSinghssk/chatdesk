import re
from datetime import date, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user
from app.core.mailer import deliver
from app.modules.admin.activity_log.service import diff, log_activity, log_bulk
from app.modules.admin.email_templates import service as email_templates
from app.modules.admin.enquiries.models import Enquiry, EnquiryActivity
from app.modules.admin.enquiries.schemas import (
    EnquiryAssignSchema,
    EnquiryBulkSchema,
    EnquiryCreateSchema,
    EnquiryFollowUpSchema,
    EnquiryNoteSchema,
    EnquiryReplySchema,
    EnquiryStatusSchema,
    EnquiryUpdateSchema,
)
from app.modules.admin.notifications.service import notify
from app.modules.admin.permissions.models import Permission
from app.modules.admin.roles.models import SUPER_ADMIN_ROLE, Role
from app.modules.admin.users.models import User
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.constants import permissions as P
from app.shared.enums import EnquiryStatus, Status
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now, today_start as today_start_utc
from app.shared.utils.search import clean_search_text, search_clause
from app.shared.constants import admin_urls as urls
from app.shared.constants.admin_urls import admin_url

SUBJECT = "enquiry"
OPEN_STATUSES = (EnquiryStatus.NEW.value, EnquiryStatus.IN_PROGRESS.value, EnquiryStatus.ON_HOLD.value)
CLOSED_STATUSES = (EnquiryStatus.CLOSED.value, EnquiryStatus.SPAM.value)
NOTE_REQUIRED_STATUSES = (EnquiryStatus.ON_HOLD.value, EnquiryStatus.CLOSED.value)
PREVIEW_LENGTH = 160
_REFERENCE = re.compile(r"^\s*ENQ-?0*(\d{1,9})\s*$", re.IGNORECASE)


def _preview(text: str | None) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= PREVIEW_LENGTH else text[: PREVIEW_LENGTH - 1].rstrip() + "…"


def _user_ref(user: User | None) -> dict | None:
    return {"id": user.id, "name": user.name} if user else None


def _serialize(row: Enquiry, full: bool = False) -> dict:
    data = {
        "id": row.id,
        "reference": row.reference,
        "source": row.source,
        "source_url": row.source_url,
        "name": row.name,
        "email": row.email,
        "phone": row.phone,
        "company": row.company,
        "subject": row.subject,
        "message_preview": _preview(row.message),
        "status": row.status,
        "assigned_to": row.assigned_to,
        "assignee": _user_ref(row.assignee),
        "follow_up_at": iso(row.follow_up_at),
        "seen_at": iso(row.seen_at),
        "created_by": row.created_by,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }
    if full:
        data["message"] = row.message
        data["creator"] = _user_ref(row.creator)
    return data


def _serialize_activity(row: EnquiryActivity) -> dict:
    return {
        "id": row.id,
        "type": row.type,
        "body": row.body,
        "meta": row.meta,
        "user": _user_ref(row.user),
        "created_at": iso(row.created_at),
    }


def _snapshot(row: Enquiry) -> dict:
    return {"name": row.name, "email": row.email, "phone": row.phone, "company": row.company,
            "subject": row.subject, "message": row.message, "source": row.source}


def _get_or_404(db: Session, enquiry_id: int) -> Enquiry:
    row = (
        db.query(Enquiry)
        .options(joinedload(Enquiry.assignee), joinedload(Enquiry.creator))
        .filter(Enquiry.id == enquiry_id, Enquiry.not_deleted())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return row


def _field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                         detail={"errors": {field: [message]}})


def _require_contact(email: str | None, phone: str | None) -> None:
    if not email and not phone:
        raise _field_error("email", "Provide an email address or a phone number")


def _assignable_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(
        User.id == user_id, User.not_deleted(), User.status == Status.ACTIVE.value
    ).first()
    if not user:
        raise _field_error("assigned_to", "Selected user does not exist or is inactive")
    return user


def _add_activity(db: Session, enquiry: Enquiry, user: User | None, type_: str,
                  body: str | None = None, meta: dict | None = None) -> EnquiryActivity:
    activity = EnquiryActivity(enquiry_id=enquiry.id, user_id=user.id if user else None,
                               type=type_, body=body, meta=meta, created_at=now())
    db.add(activity)
    db.flush()
    return activity


def _notify_assignee(db: Session, enquiry: Enquiry, assignee_id: int | None, actor: User | None) -> None:
    if not assignee_id or (actor and actor.id == assignee_id):
        return
    who = actor.name if actor else "Someone"
    notify(db, [assignee_id], type="enquiry.assigned", title="Enquiry assigned to you",
           message=f"{who} assigned {enquiry.reference} ({enquiry.name}) to you",
           url=admin_url(urls.ENQUIRIES, enquiry=enquiry.id), data={"enquiry_id": enquiry.id})


def _base_query(db: Session):
    return db.query(Enquiry).filter(Enquiry.not_deleted())


GRID_FIELDS = {
    "reference": GridField(Enquiry.id, "number"),
    "name": GridField(Enquiry.name, "text"),
    "email": GridField(Enquiry.email, "text"),
    "phone": GridField(Enquiry.phone, "text"),
    "company": GridField(Enquiry.company, "text"),
    "subject": GridField(Enquiry.subject, "text"),
    "message": GridField(Enquiry.message, "text", sortable=False),
    "status": GridField(Enquiry.status, "enum"),
    "source": GridField(Enquiry.source, "enum"),
    "assignee": GridField(Enquiry.assigned_to, "enum", cast=int),
    "created_at": GridField(Enquiry.created_at, "date"),
    "follow_up_at": GridField(Enquiry.follow_up_at, "date"),
    "seen": GridField(Enquiry.seen_at.isnot(None), "bool", sortable=False),
}


def list_enquiries(db: Session, user_id: int, page=None, per_page=None, search=None, status=None,
                   source=None, assigned=None, follow_up=None, seen=None,
                   date_from: date | None = None, date_to: date | None = None, view=None,
                   filters: str | None = None, match: str | None = "and", sort: str | None = None):
    q = _base_query(db).options(joinedload(Enquiry.assignee))
    current = now()

    term = clean_search_text(search)
    if term:
        ref = _REFERENCE.match(term)
        if ref:
            q = q.filter(Enquiry.id == int(ref.group(1)))
        else:
            q = q.filter(search_clause([Enquiry.name, Enquiry.email, Enquiry.phone, Enquiry.company,
                                        Enquiry.subject, Enquiry.message], term))

    if view == "open":
        q = q.filter(Enquiry.status.in_(OPEN_STATUSES))
    elif view == "follow_up":
        q = q.filter(Enquiry.follow_up_at.isnot(None), Enquiry.status.notin_(CLOSED_STATUSES))
    elif view == "mine":
        q = q.filter(Enquiry.assigned_to == user_id)

    if status == "open":
        q = q.filter(Enquiry.status.in_(OPEN_STATUSES))
    elif status:
        q = q.filter(Enquiry.status == status)
    if source:
        q = q.filter(Enquiry.source == source)

    if assigned == "me":
        q = q.filter(Enquiry.assigned_to == user_id)
    elif assigned == "none":
        q = q.filter(Enquiry.assigned_to.is_(None))
    elif assigned:
        if not str(assigned).isdigit():
            raise _field_error("assigned", "Use 'me', 'none' or a user id")
        q = q.filter(Enquiry.assigned_to == int(assigned))

    if follow_up == "due":
        q = q.filter(Enquiry.follow_up_at.isnot(None), Enquiry.follow_up_at <= current)
    elif follow_up == "upcoming":
        q = q.filter(Enquiry.follow_up_at > current)
    elif follow_up == "none":
        q = q.filter(Enquiry.follow_up_at.is_(None))

    if seen == "seen":
        q = q.filter(Enquiry.seen_at.isnot(None))
    elif seen == "unseen":
        q = q.filter(Enquiry.seen_at.is_(None))

    if date_from:
        q = q.filter(Enquiry.created_at >= date_from)
    if date_to:
        q = q.filter(Enquiry.created_at < date_to + timedelta(days=1))

    q = apply_filters(q, GRID_FIELDS, filters, match)
    default_order = [Enquiry.follow_up_at.asc(), Enquiry.id.desc()] if view == "follow_up" else [Enquiry.id.desc()]
    q = apply_sort(q, GRID_FIELDS, sort, default_order)
    return list_response(q, _serialize, page, per_page, search)


def stats(db: Session, user_id: int):
    current = now()
    today_start = today_start_utc()
    week_start = today_start - timedelta(days=6)

    def count(*filters) -> int:
        return db.query(func.count(Enquiry.id)).filter(Enquiry.not_deleted(), *filters).scalar() or 0

    by_status = dict(
        db.query(Enquiry.status, func.count(Enquiry.id))
        .filter(Enquiry.not_deleted())
        .group_by(Enquiry.status)
        .all()
    )
    return {
        "status": True,
        "data": {
            "open": count(Enquiry.status.in_(OPEN_STATUSES)),
            "new": by_status.get(EnquiryStatus.NEW.value, 0),
            "unseen": count(Enquiry.seen_at.is_(None), Enquiry.status != EnquiryStatus.SPAM.value),
            "follow_up_due": count(Enquiry.follow_up_at.isnot(None), Enquiry.follow_up_at <= current,
                                   Enquiry.status.notin_(CLOSED_STATUSES)),
            "mine": count(Enquiry.assigned_to == user_id, Enquiry.status.in_(OPEN_STATUSES)),
            "unassigned": count(Enquiry.assigned_to.is_(None), Enquiry.status.in_(OPEN_STATUSES)),
            "today": count(Enquiry.created_at >= today_start),
            "this_week": count(Enquiry.created_at >= week_start),
            "last_week": count(Enquiry.created_at >= week_start - timedelta(days=7), Enquiry.created_at < week_start),
            "total": sum(by_status.values()),
            "by_status": {s: by_status.get(s, 0) for s in EnquiryStatus.values()},
        },
    }


def sources(db: Session):
    rows = (
        db.query(Enquiry.source).filter(Enquiry.not_deleted()).distinct().order_by(Enquiry.source).all()
    )
    return {"status": True, "data": [s for (s,) in rows if s]}


def assignees(db: Session):
    base = db.query(User.id).filter(User.status == Status.ACTIVE.value, User.not_deleted())
    ids = {uid for (uid,) in base.join(Role, User.role_id == Role.id).filter(Role.name == SUPER_ADMIN_ROLE).all()}
    ids.update(uid for (uid,) in base.join(Role, User.role_id == Role.id).join(Role.permissions)
               .filter(Permission.name == P.ENQUIRIES_VIEW).all())
    ids.update(uid for (uid,) in base.join(User.direct_permissions)
               .filter(Permission.name == P.ENQUIRIES_VIEW).all())
    users = db.query(User).filter(User.id.in_(ids)).order_by(User.name).all() if ids else []
    return {"status": True, "data": [{"id": u.id, "name": u.name} for u in users]}


def _activities(db: Session, enquiry_id: int) -> list[dict]:
    rows = (
        db.query(EnquiryActivity)
        .options(joinedload(EnquiryActivity.user))
        .filter(EnquiryActivity.enquiry_id == enquiry_id)
        .order_by(EnquiryActivity.created_at.desc(), EnquiryActivity.id.desc())
        .all()
    )
    return [_serialize_activity(r) for r in rows]


def _detail(db: Session, enquiry_id: int) -> dict:
    row = _get_or_404(db, enquiry_id)
    return {**_serialize(row, full=True), "activities": _activities(db, row.id)}


def get_enquiry(db: Session, enquiry_id: int):
    row = _get_or_404(db, enquiry_id)
    if row.seen_at is None:
        row.seen_at = now()
        db.commit()
    return {"status": True, "data": _detail(db, enquiry_id)}


def create_enquiry(db: Session, payload: EnquiryCreateSchema, request: Request):
    user = get_current_user(request)
    _require_contact(payload.email, payload.phone)
    if payload.assigned_to:
        _assignable_user(db, payload.assigned_to)

    row = Enquiry(
        source=payload.source,
        name=payload.name,
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        company=payload.company,
        subject=payload.subject,
        message=payload.message,
        status=payload.status,
        assigned_to=payload.assigned_to or None,
        follow_up_at=payload.follow_up_at,
        created_by=user.id,
        seen_at=now(),
    )
    db.add(row)
    db.flush()
    _add_activity(db, row, user, "created", meta={"source": row.source})
    if payload.note:
        _add_activity(db, row, user, "note", body=payload.note)
    _notify_assignee(db, row, row.assigned_to, user)
    log_activity(db, "created", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=f"{row.reference} {row.name}", new_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Enquiry created", "data": _detail(db, row.id)}


def update_enquiry(db: Session, enquiry_id: int, payload: EnquiryUpdateSchema, request: Request):
    user = get_current_user(request)
    row = _get_or_404(db, enquiry_id)
    _require_contact(payload.email, payload.phone)
    before = _snapshot(row)
    data = payload.model_dump()
    data["email"] = str(payload.email) if payload.email else None
    if data.get("source") is None:
        data.pop("source", None)
    for key, value in data.items():
        setattr(row, key, value)
    old, new = diff(before, _snapshot(row))
    if new:
        _add_activity(db, row, user, "edited", body="Updated contact details", meta={"old": old, "new": new})
        log_activity(db, "updated", request=request, subject_type=SUBJECT, subject_id=row.id,
                     subject_label=f"{row.reference} {row.name}", old_values=old, new_values=new)
    db.commit()
    return {"status": True, "message": "Enquiry updated", "data": _detail(db, row.id)}


def change_status(db: Session, enquiry_id: int, payload: EnquiryStatusSchema, request: Request):
    user = get_current_user(request)
    row = _get_or_404(db, enquiry_id)
    new_status = payload.status.value
    if new_status in NOTE_REQUIRED_STATUSES and not payload.note:
        raise _field_error("note", "Please add a note explaining this status")
    old_status = row.status
    if old_status == new_status and not payload.note:
        return {"status": True, "message": "Status unchanged", "data": _detail(db, row.id)}
    row.status = new_status
    _add_activity(db, row, user, "status", body=payload.note, meta={"from": old_status, "to": new_status})
    log_activity(db, "status_changed", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=f"{row.reference} {row.name}",
                 old_values={"status": old_status}, new_values={"status": new_status})
    db.commit()
    return {"status": True, "message": "Status updated", "data": _detail(db, row.id)}


def add_note(db: Session, enquiry_id: int, payload: EnquiryNoteSchema, request: Request):
    user = get_current_user(request)
    row = _get_or_404(db, enquiry_id)
    activity = _add_activity(db, row, user, "note", body=payload.body)
    log_activity(db, "note_added", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=f"{row.reference} {row.name}", new_values={"activity_id": activity.id})
    db.commit()
    db.refresh(activity)
    return {"status": True, "message": "Note added", "data": _serialize_activity(activity)}


def delete_note(db: Session, enquiry_id: int, activity_id: int, request: Request):
    user = get_current_user(request)
    row = _get_or_404(db, enquiry_id)
    activity = db.query(EnquiryActivity).filter(
        EnquiryActivity.id == activity_id, EnquiryActivity.enquiry_id == row.id, EnquiryActivity.type == "note"
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Note not found")
    if activity.user_id != user.id and not user.is_super_admin:
        raise HTTPException(status_code=403, detail="You can only delete your own notes")
    log_activity(db, "note_deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=f"{row.reference} {row.name}", old_values={"body": activity.body})
    db.delete(activity)
    db.commit()
    return {"status": True, "message": "Note deleted"}


def assign(db: Session, enquiry_id: int, payload: EnquiryAssignSchema, request: Request):
    user = get_current_user(request)
    row = _get_or_404(db, enquiry_id)
    assignee = _assignable_user(db, payload.user_id) if payload.user_id else None
    old_id = row.assigned_to
    new_id = assignee.id if assignee else None
    if old_id == new_id:
        return {"status": True, "message": "Assignment unchanged", "data": _detail(db, row.id)}
    row.assigned_to = new_id
    _add_activity(db, row, user, "assigned",
                  body=f"Assigned to {assignee.name}" if assignee else "Unassigned",
                  meta={"from": old_id, "to": new_id, "to_name": assignee.name if assignee else None})
    _notify_assignee(db, row, new_id, user)
    log_activity(db, "assigned", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=f"{row.reference} {row.name}",
                 old_values={"assigned_to": old_id}, new_values={"assigned_to": new_id})
    db.commit()
    return {"status": True, "message": "Enquiry assigned" if assignee else "Enquiry unassigned",
            "data": _detail(db, row.id)}


def set_follow_up(db: Session, enquiry_id: int, payload: EnquiryFollowUpSchema, request: Request):
    user = get_current_user(request)
    row = _get_or_404(db, enquiry_id)
    old = row.follow_up_at
    row.follow_up_at = payload.follow_up_at
    _add_activity(db, row, user, "follow_up",
                  body=None if payload.follow_up_at else "Follow-up cleared",
                  meta={"from": iso(old), "to": iso(payload.follow_up_at)})
    log_activity(db, "follow_up", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=f"{row.reference} {row.name}",
                 old_values={"follow_up_at": iso(old)}, new_values={"follow_up_at": iso(payload.follow_up_at)})
    db.commit()
    return {"status": True, "message": "Follow-up set" if payload.follow_up_at else "Follow-up cleared",
            "data": _detail(db, row.id)}


def reply_draft(db: Session, enquiry_id: int, request: Request):
    user = get_current_user(request)
    row = _get_or_404(db, enquiry_id)
    variables = email_templates.common_variables(db, email_templates.reply_variables(db, row, user))
    template = email_templates.values(db, "enquiry_reply")
    return {"status": True, "data": {
        "subject": email_templates.fill(template.get("subject", ""), variables),
        "body": email_templates.fill(template.get("body", ""), variables),
    }}


def reply(db: Session, enquiry_id: int, payload: EnquiryReplySchema, request: Request):
    user = get_current_user(request)
    row = _get_or_404(db, enquiry_id)
    if not row.email:
        raise _field_error("email", "This enquiry has no email address to reply to")

    rendered = email_templates.render_reply(
        db, email_templates.reply_variables(db, row, user), payload.subject, payload.body,
        row.message if payload.include_original else None,
        row.created_at.strftime("%d %b %Y") if row.created_at else None,
    )
    deliver(db, row.email, rendered["subject"], rendered["html"], rendered["text"],
            reply_to=user.email, raise_errors=True)

    meta = {"subject": payload.subject, "to": row.email, "include_original": payload.include_original}
    if row.status == EnquiryStatus.NEW.value:
        row.status = EnquiryStatus.REPLIED.value
        meta["status"] = {"from": EnquiryStatus.NEW.value, "to": EnquiryStatus.REPLIED.value}
    _add_activity(db, row, user, "reply", body=payload.body, meta=meta)
    log_activity(db, "replied", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=f"{row.reference} {row.name}", new_values={"subject": payload.subject, "to": row.email})
    db.commit()
    return {"status": True, "message": f"Reply sent to {row.email}", "data": _detail(db, row.id)}


def delete_enquiry(db: Session, enquiry_id: int, request: Request):
    row = _get_or_404(db, enquiry_id)
    row.deleted_at = now()
    log_activity(db, "deleted", request=request, subject_type=SUBJECT, subject_id=row.id,
                 subject_label=f"{row.reference} {row.name}", description="Moved to trash", old_values=_snapshot(row))
    db.commit()
    return {"status": True, "message": "Enquiry moved to trash"}


def bulk_action(db: Session, payload: EnquiryBulkSchema, request: Request):
    user = get_current_user(request)
    rows = db.query(Enquiry).filter(Enquiry.id.in_(payload.ids), Enquiry.not_deleted()).all()
    statuses = {r.id: r.status for r in rows}
    snapshots = {r.id: _snapshot(r) for r in rows} if payload.action == "delete" else {}
    changed = 0
    if payload.action == "delete":
        for row in rows:
            row.deleted_at = now()
        changed = len(rows)
    else:
        new_status = payload.action.removeprefix("mark-")
        for row in rows:
            if row.status == new_status:
                continue
            _add_activity(db, row, user, "status", meta={"from": row.status, "to": new_status, "bulk": True})
            row.status = new_status
            changed += 1
    log_bulk(db, payload.action, rows, request=request, subject_type=SUBJECT, label=lambda r: f"{r.reference} {r.name}",
             statuses=statuses, snapshots=snapshots)
    db.commit()
    if payload.action == "delete":
        return {"status": True, "message": f"{changed} enquiries moved to trash"}
    return {"status": True, "message": f"{changed} enquiries updated"}
