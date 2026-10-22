from dataclasses import dataclass, field
from datetime import timedelta
from typing import Callable

from fastapi import HTTPException, Request
from sqlalchemy import cast, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.types import Text

from app.modules.admin.activity_log.service import log_activity
from app.modules.admin.auth.models import UserSession
from app.modules.admin.blog_categories.models import BlogCategory
from app.modules.admin.blogs.models import Blog
from app.modules.admin.enquiries.models import Enquiry
from app.modules.admin.galleries.models import Gallery, GalleryItem
from app.modules.admin.media.models import MediaFile
from app.modules.admin.pages.models import Page
from app.modules.admin.seo.models import SeoPage
from app.modules.admin.settings.models import Setting
from app.modules.admin.team_members.models import TeamMember
from app.modules.admin.testimonials.models import Testimonial
from app.modules.admin.users.models import User
from app.modules.customer.account.models import Customer
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.grid import GridField, apply_filters, apply_sort
from app.shared.utils.search import search_clause
from app.shared.utils.uploads import delete_stored_file, stored_path


@dataclass
class TrashType:
    label: str
    model: type
    title: Callable
    subtitle: Callable
    search_columns: Callable
    unique_field: str | None = None
    file_fields: list[str] = field(default_factory=list)
    title_column: Callable | None = None
    subtitle_column: Callable | None = None


REGISTRY: dict[str, TrashType] = {
    "blogs": TrashType("Blog posts", Blog, lambda r: r.title, lambda r: f"/{r.slug}",
                       lambda: [Blog.title, Blog.slug], "slug", ["featured_image"],
                       lambda: Blog.title, lambda: Blog.slug),
    "pages": TrashType("Pages", Page, lambda r: r.title, lambda r: f"/{r.slug}",
                       lambda: [Page.title, Page.slug], "slug", ["featured_image"],
                       lambda: Page.title, lambda: Page.slug),
    "blog_categories": TrashType("Blog categories", BlogCategory, lambda r: r.name, lambda r: r.slug,
                                 lambda: [BlogCategory.name, BlogCategory.slug], "slug", ["image"],
                                 lambda: BlogCategory.name, lambda: BlogCategory.slug),
    "testimonials": TrashType("Testimonials", Testimonial, lambda r: r.name,
                              lambda r: ", ".join(filter(None, [r.designation, r.company])),
                              lambda: [Testimonial.name, Testimonial.company], None, ["photo"],
                              lambda: Testimonial.name, lambda: Testimonial.company),
    "team_members": TrashType("Team members", TeamMember, lambda r: r.name,
                              lambda r: ", ".join(filter(None, [r.designation, r.department])),
                              lambda: [TeamMember.name, TeamMember.designation], None, ["photo"],
                              lambda: TeamMember.name, lambda: TeamMember.designation),
    "enquiries": TrashType("Enquiries", Enquiry, lambda r: r.name, lambda r: r.subject or r.email or r.phone,
                           lambda: [Enquiry.name, Enquiry.email, Enquiry.subject], None, [],
                           lambda: Enquiry.name, lambda: Enquiry.subject),
    "customers": TrashType("Customers", Customer, lambda r: r.name or r.email or r.phone or f"Customer #{r.id}",
                           lambda r: r.email or r.phone, lambda: [Customer.name, Customer.email, Customer.phone],
                           "email", [], lambda: Customer.name, lambda: Customer.email),
    "users": TrashType("Users", User, lambda r: r.name, lambda r: r.email,
                       lambda: [User.name, User.email], "email", ["avatar"],
                       lambda: User.name, lambda: User.email),
}

STALE_DAYS = 30


_FILE_COLUMNS = [
    (Blog, Blog.featured_image), (Page, Page.featured_image), (BlogCategory, BlogCategory.image),
    (Testimonial, Testimonial.photo), (TeamMember, TeamMember.photo), (User, User.avatar), (Gallery, Gallery.cover_image),
    (GalleryItem, GalleryItem.path), (SeoPage, SeoPage.og_image),
]


def file_in_use(db: Session, url: str | None, exclude: tuple[type, int] | None = None) -> bool:
    if not url:
        return False
    rel = stored_path(url)
    if db.query(MediaFile.id).filter(or_(MediaFile.url == url, MediaFile.path == rel)).first():
        return True
    for model, column in _FILE_COLUMNS:
        q = db.query(model.id).filter(column == url)
        if exclude and exclude[0] is model:
            q = q.filter(model.id != exclude[1])
        if q.first():
            return True
    return db.query(Setting.id).filter(cast(Setting.value, Text).contains(url, autoescape=True)).first() is not None


def _type(key: str) -> TrashType:
    entry = REGISTRY.get(key)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Unknown trash type '{key}'")
    return entry


def summary(db: Session):
    data = []
    for key, entry in REGISTRY.items():
        count = db.query(func.count(entry.model.id)).filter(entry.model.deleted_at.is_not(None)).scalar() or 0
        data.append({"type": key, "label": entry.label, "count": count})
    return {"status": True, "data": data}


def _grid_fields(entry: TrashType) -> dict[str, GridField]:
    model = entry.model
    fields = {
        "id": GridField(model.id, "number"),
        "deleted_at": GridField(model.deleted_at, "date"),
    }
    if entry.title_column:
        fields["title"] = GridField(entry.title_column(), "text")
    if entry.subtitle_column:
        fields["subtitle"] = GridField(entry.subtitle_column(), "text")
    return fields


def list_items(db: Session, key: str, page=None, per_page=None, search=None, sort: str | None = None,
               filters: str | None = None, match: str | None = "and"):
    entry = _type(key)
    model = entry.model
    q = db.query(model).filter(model.deleted_at.is_not(None))
    clause = search_clause(entry.search_columns(), search)
    if clause is not None:
        q = q.filter(clause)
    fields = _grid_fields(entry)
    q = apply_filters(q, fields, filters, match)
    if sort == "oldest":
        sort = "deleted_at"
    elif sort == "newest":
        sort = None
    q = apply_sort(q, fields, sort, [model.deleted_at.desc(), model.id.desc()])

    def serialize(row):
        return {"id": row.id, "title": entry.title(row), "subtitle": entry.subtitle(row),
                "deleted_at": iso(row.deleted_at)}

    return list_response(q, serialize, page or 1, per_page or 25, search)


def stats(db: Session):
    stale_before = now() - timedelta(days=STALE_DAYS)
    by_type, oldest, stale = [], None, 0
    for key, entry in REGISTRY.items():
        model = entry.model
        count, first = db.query(func.count(model.id), func.min(model.deleted_at)).filter(
            model.deleted_at.is_not(None)
        ).one()
        old = db.query(func.count(model.id)).filter(
            model.deleted_at.is_not(None), model.deleted_at < stale_before
        ).scalar() or 0
        by_type.append({"type": key, "label": entry.label, "count": count or 0, "stale": old})
        stale += old
        if first and (oldest is None or first < oldest["deleted_at"]):
            oldest = {"type": key, "label": entry.label, "deleted_at": first}
    return {
        "status": True,
        "data": {
            "total": sum(t["count"] for t in by_type),
            "by_type": by_type,
            "stale": stale,
            "stale_days": STALE_DAYS,
            "oldest": {**oldest, "deleted_at": iso(oldest["deleted_at"])} if oldest else None,
        },
    }


def restore(db: Session, key: str, ids: list[int], request: Request):
    entry = _type(key)
    model = entry.model
    rows = db.query(model).filter(model.id.in_(ids), model.deleted_at.is_not(None)).order_by(model.id).all()
    restored, skipped = 0, []
    taken: set[str] = set()
    for row in rows:
        if entry.unique_field:
            value = getattr(row, entry.unique_field)
            column = getattr(model, entry.unique_field)
            normalized = (value or "").lower() if entry.unique_field == "email" else value
            match = func.lower(column) == normalized if entry.unique_field == "email" else column == value
            clash = normalized in taken or db.query(model.id).filter(
                match, model.deleted_at.is_(None), model.id != row.id
            ).first()
            if clash:
                skipped.append({"id": row.id, "reason": f"Another live record already uses {entry.unique_field} '{value}'"})
                continue
            taken.add(normalized)
        try:
            with db.begin_nested():
                row.deleted_at = None
                db.flush()
        except IntegrityError:
            skipped.append({"id": row.id, "reason": "It clashes with another live record"})
            continue
        restored += 1
        log_activity(db, "restored", request=request, subject_type=key, subject_id=row.id,
                     subject_label=entry.title(row), description="Restored from trash")
    db.commit()
    message = f"{restored} item(s) restored" + (f", {len(skipped)} skipped" if skipped else "")
    return {"status": True, "message": message, "data": {"restored": restored, "skipped": skipped}}


def _purge(db: Session, key: str, rows: list, request: Request) -> int:
    entry = _type(key)
    files: set[str] = set()
    for row in rows:
        files.update(filter(None, (getattr(row, f, None) for f in entry.file_fields)))
        if key == "users":
            db.query(UserSession).filter(UserSession.user_id == row.id).delete()
        log_activity(db, "force_deleted", request=request, subject_type=key, subject_id=row.id,
                     subject_label=entry.title(row), description="Permanently deleted from trash")
        db.delete(row)
    db.commit()
    for url in files:
        if not file_in_use(db, url):
            delete_stored_file(url)
    return len(rows)


def delete_forever(db: Session, key: str, ids: list[int], request: Request):
    model = _type(key).model
    rows = db.query(model).filter(model.id.in_(ids), model.deleted_at.is_not(None)).all()
    count = _purge(db, key, rows, request)
    return {"status": True, "message": f"{count} item(s) permanently deleted"}


def empty(db: Session, key: str, request: Request):
    model = _type(key).model
    rows = db.query(model).filter(model.deleted_at.is_not(None)).all()
    count = _purge(db, key, rows, request)
    return {"status": True, "message": f"Trash emptied ({count} item(s))"}
