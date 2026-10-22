from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings
from app.modules.admin.blog_categories import service as category_service
from app.modules.admin.blog_categories.models import BlogCategory
from app.modules.admin.blog_categories.schemas import BlogCategoryCreateSchema
from app.modules.admin.blogs import service as blog_service
from app.modules.admin.blogs.models import Blog
from app.modules.admin.blogs.schemas import BlogCreateSchema
from app.modules.admin.enquiries.models import Enquiry
from app.modules.admin.not_found.models import NotFoundLog
from app.modules.admin.pages import service as page_service
from app.modules.admin.pages.models import Page
from app.modules.admin.pages.schemas import PageCreateSchema
from app.modules.admin.redirects import service as redirect_service
from app.modules.admin.redirects.models import Redirect
from app.modules.admin.redirects.schemas import RedirectCreateSchema
from app.modules.admin.seo import service as seo_service
from app.modules.admin.seo.models import SeoPage
from app.modules.admin.seo.schemas import SeoPageCreateSchema
from app.modules.admin.testimonials import service as testimonial_service
from app.modules.admin.testimonials.models import Testimonial
from app.modules.admin.testimonials.schemas import TestimonialCreateSchema
from app.modules.admin.users.models import User
from app.shared.constants import permissions as P
from app.shared.utils.slug import normalize_slug
from app.shared.utils.datetime import to_utc


class RowError(Exception):

    def __init__(self, *messages: str):
        super().__init__("; ".join(messages))
        self.messages = [m for m in messages if m]


@dataclass
class Col:
    name: str
    help: str
    example: str = ""
    required: bool = False


@dataclass
class Prepared:
    payload: BaseModel
    identity: str
    label: str
    warnings: list[str] = field(default_factory=list)
    extra: dict = field(default_factory=dict)


_TRUE = {"1", "yes", "y", "true", "on", "active", "published", "enabled", "live"}
_FALSE = {"0", "no", "n", "false", "off", "inactive", "draft", "disabled", "hidden"}


def to_bool(value: str, default: bool = False) -> bool:
    value = (value or "").strip().lower()
    if not value:
        return default
    if value in _TRUE:
        return True
    if value in _FALSE:
        return False
    raise RowError(f"“{value}” isn't yes or no.")


def to_status(value: str, default: str = "active") -> str:
    value = (value or "").strip().lower()
    if not value:
        return default
    if value in _TRUE:
        return "active"
    if value in _FALSE:
        return "inactive"
    return value


def to_publish_status(value: str, default: str = "published") -> str:
    status = to_status(value, "")
    return {"active": "published", "inactive": "draft", "": default}.get(status, status)


def to_datetime(value: str, column: str) -> datetime | None:
    value = (value or "").strip()
    if not value:
        return None
    candidates = [value, value.replace("/", "-")]
    for text in candidates:
        try:
            parsed = datetime.fromisoformat(text)
            return to_utc(parsed)
        except ValueError:
            pass
    for fmt in ("%d-%m-%Y %H:%M", "%d-%m-%Y", "%d-%m-%Y %H:%M:%S"):
        try:
            return to_utc(datetime.strptime(value.replace("/", "-"), fmt))
        except ValueError:
            pass
    raise RowError(f"{column}: “{value}” isn't a date, e.g. 2026-09-23 10:00.")


def to_int(value: str, column: str) -> int | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        raise RowError(f"{column}: “{value}” isn't a number.")


def blank(value: str) -> str | None:
    value = (value or "").strip()
    return value or None


def split_list(value: str) -> list[str]:
    return [part.strip() for part in (value or "").split("|") if part.strip()]


def file_url(path: str | None) -> str:
    if not path:
        return ""
    if path.startswith(("http://", "https://")):
        return path
    base = (getattr(settings, "APP_URL", "") or "").rstrip("/")
    return f"{base}/{path.lstrip('/')}" if base else path


def validation_messages(exc: ValidationError, rename: dict[str, str] | None = None) -> list[str]:
    rename = rename or {}
    messages = []
    for error in exc.errors():
        loc = [str(p) for p in error.get("loc", []) if not isinstance(p, int)]
        column = rename.get(loc[0], loc[0]) if loc else "row"
        msg = error.get("msg", "Invalid value").replace("Value error, ", "")
        if error.get("type") == "missing":
            msg = "is required"
        messages.append(f"{column}: {msg}")
    return messages


def http_messages(exc: HTTPException, rename: dict[str, str] | None = None) -> list[str]:
    rename = rename or {}
    detail = exc.detail
    if isinstance(detail, dict):
        errors = detail.get("errors") or {}
        messages = [f"{rename.get(k, k)}: {v[0] if isinstance(v, list) and v else v}" for k, v in errors.items()]
        return messages or [str(detail.get("message") or "Invalid row")]
    return [str(detail)]


class TransferType:
    key: str = ""
    label: str = ""
    noun: str = "rows"
    subject: str = ""
    view_perm: str = ""
    create_perm: str | None = None
    update_perm: str | None = None
    columns: list[Col] = []
    export_extra: list[str] = []
    rename: dict[str, str] = {}
    schema: type[BaseModel] | None = None

    @property
    def importable(self) -> bool:
        return self.create_perm is not None

    @property
    def column_names(self) -> list[str]:
        return [c.name for c in self.columns]

    def export_headers(self) -> list[str]:
        return self.column_names + self.export_extra

    def export_query(self, db: Session):
        raise NotImplementedError

    def export_row(self, row) -> list:
        raise NotImplementedError

    def build(self, db: Session, values: dict[str, str], earlier: set[str]) -> Prepared:
        raise NotImplementedError

    def find_existing(self, db: Session, prepared: Prepared):
        return None

    def check(self, db: Session, prepared: Prepared) -> None:
        pass

    def save(self, db: Session, prepared: Prepared, existing, user: User):
        raise NotImplementedError

    def validate(self, data: dict) -> BaseModel:
        try:
            return self.schema.model_validate(data)
        except ValidationError as exc:
            raise RowError(*validation_messages(exc, self.rename))

    def run(self, fn, *args):
        try:
            return fn(*args)
        except HTTPException as exc:
            raise RowError(*http_messages(exc, self.rename))


class BlogTransfer(TransferType):
    key, label, noun, subject = "blogs", "Blog posts", "blog posts", "blog"
    view_perm, create_perm, update_perm = P.BLOGS_VIEW, P.BLOGS_CREATE, P.BLOGS_UPDATE
    schema = BlogCreateSchema
    rename = {"category_ids": "categories"}
    columns = [
        Col("title", "Post title", "Ten tips for faster websites", True),
        Col("slug", "Web address. Made from the title when empty", "faster-websites"),
        Col("excerpt", "Short summary (max 500 characters)", "What slows a site down, and how to fix it."),
        Col("content", "The post, as HTML or plain text", "<p>First paragraph…</p>", True),
        Col("status", "published or draft (default published)", "published"),
        Col("published_at", "Publish date, e.g. 2026-09-23 10:00 (empty = now)", "2026-09-23 10:00"),
        Col("categories", "Category names or slugs, separated by |", "Performance | Guides"),
        Col("featured_image", "Image URL (kept as a link)", "https://example.com/cover.jpg"),
        Col("meta_title", "Title in search results", ""),
        Col("meta_description", "Snippet in search results", ""),
    ]
    export_extra = ["author"]

    def export_query(self, db):
        return (db.query(Blog).options(selectinload(Blog.categories), joinedload(Blog.author))
                .filter(Blog.not_deleted()).order_by(Blog.id.desc()))

    def export_row(self, b):
        return [b.title, b.slug, b.excerpt, b.content, b.status, b.published_at,
                " | ".join(c.name for c in b.categories if c.deleted_at is None), file_url(b.featured_image),
                b.meta_title, b.meta_description, b.author.email if b.author else ""]

    def build(self, db, v, earlier):
        warnings, ids = [], []
        for name in split_list(v.get("categories")):
            category = (db.query(BlogCategory)
                        .filter(BlogCategory.not_deleted(),
                                or_(BlogCategory.slug == normalize_slug(name),
                                    func.lower(BlogCategory.name) == name.lower()))
                        .first())
            if category:
                ids.append(category.id)
            else:
                warnings.append(f"Category “{name}” doesn't exist and will be left out.")
        payload = self.validate({
            "title": v.get("title", "").strip(),
            "slug": blank(v.get("slug")),
            "excerpt": blank(v.get("excerpt")),
            "content": blank(v.get("content")),
            "status": to_publish_status(v.get("status")),
            "published_at": to_datetime(v.get("published_at"), "published_at"),
            "featured_image": blank(v.get("featured_image")),
            "meta_title": blank(v.get("meta_title")),
            "meta_description": blank(v.get("meta_description")),
            "category_ids": list(dict.fromkeys(ids)),
        })
        if not payload.content:
            raise RowError("content: is required")
        slug = normalize_slug(payload.slug or payload.title)
        return Prepared(payload, slug, payload.title, warnings)

    def find_existing(self, db, p):
        return db.query(Blog).filter(Blog.slug == p.identity, Blog.not_deleted()).first()

    def check(self, db, p):
        self.run(blog_service._prepare, db, p.payload)

    def save(self, db, p, existing, user):
        data, categories = self.run(blog_service._prepare, db, p.payload, existing.id if existing else None)
        row = existing or Blog(author_id=user.id)
        for key, value in data.items():
            setattr(row, key, value)
        row.categories = categories
        db.add(row)
        return row


class BlogCategoryTransfer(TransferType):
    key, label, noun, subject = "blog_categories", "Blog categories", "categories", "blog_category"
    view_perm, create_perm, update_perm = P.BLOG_CATEGORIES_VIEW, P.BLOG_CATEGORIES_CREATE, P.BLOG_CATEGORIES_UPDATE
    schema = BlogCategoryCreateSchema
    rename = {"parent_id": "parent"}
    columns = [
        Col("name", "Category name", "Guides", True),
        Col("slug", "Web address. Made from the name when empty", "guides"),
        Col("parent", "Slug or name of the parent category, empty for a top-level one", ""),
        Col("description", "Short description", "Step-by-step articles."),
        Col("status", "active or inactive (default active)", "active"),
        Col("image", "Image URL (kept as a link)", "https://example.com/guides.jpg"),
    ]

    def export_query(self, db):
        return (db.query(BlogCategory).options(joinedload(BlogCategory.parent))
                .filter(BlogCategory.not_deleted()).order_by(BlogCategory.id))

    def export_row(self, c):
        return [c.name, c.slug, c.parent.slug if c.parent else "", c.description, c.status, file_url(c.image)]

    def _find(self, db, ref: str):
        return (db.query(BlogCategory)
                .filter(BlogCategory.not_deleted(),
                        or_(BlogCategory.slug == normalize_slug(ref), func.lower(BlogCategory.name) == ref.lower()))
                .first())

    def build(self, db, v, earlier):
        extra, parent_id = {}, None
        parent_ref = (v.get("parent") or "").strip()
        if parent_ref:
            parent = self._find(db, parent_ref)
            if parent:
                parent_id = parent.id
            elif normalize_slug(parent_ref) in earlier:
                extra["parent_slug"] = normalize_slug(parent_ref)
            else:
                raise RowError(f"parent: category “{parent_ref}” doesn't exist.")
        payload = self.validate({
            "name": v.get("name", "").strip(),
            "slug": blank(v.get("slug")),
            "parent_id": parent_id,
            "description": blank(v.get("description")),
            "image": blank(v.get("image")),
            "status": to_status(v.get("status")),
        })
        return Prepared(payload, normalize_slug(payload.slug or payload.name), payload.name, extra=extra)

    def find_existing(self, db, p):
        return db.query(BlogCategory).filter(BlogCategory.slug == p.identity, BlogCategory.not_deleted()).first()

    def check(self, db, p):
        if not p.extra.get("parent_slug"):
            self.run(category_service._prepare, db, p.payload)

    def save(self, db, p, existing, user):
        payload = p.payload
        if p.extra.get("parent_slug"):
            parent = self._find(db, p.extra["parent_slug"])
            if not parent:
                raise RowError(f"parent: category “{p.extra['parent_slug']}” doesn't exist.")
            payload = payload.model_copy(update={"parent_id": parent.id})
        data = self.run(category_service._prepare, db, payload, existing.id if existing else None)
        row = existing or BlogCategory()
        for key, value in data.items():
            setattr(row, key, value)
        db.add(row)
        return row


class PageTransfer(TransferType):
    key, label, noun, subject = "pages", "Pages", "pages", "page"
    view_perm, create_perm, update_perm = P.PAGES_VIEW, P.PAGES_CREATE, P.PAGES_UPDATE
    schema = PageCreateSchema
    columns = [
        Col("title", "Page title", "Privacy policy", True),
        Col("slug", "Web address. Made from the title when empty", "privacy-policy"),
        Col("content", "The page, as HTML or plain text", "<p>We respect your privacy…</p>", True),
        Col("status", "published or draft (default published)", "published"),
        Col("published_at", "Publish date, e.g. 2026-09-23 10:00 (empty = now)", ""),
        Col("featured_image", "Banner image URL (kept as a link)", ""),
        Col("meta_title", "Title in search results", ""),
        Col("meta_description", "Snippet in search results", ""),
    ]
    export_extra = ["author"]

    def export_query(self, db):
        return db.query(Page).options(joinedload(Page.author)).filter(Page.not_deleted()).order_by(Page.id.desc())

    def export_row(self, p):
        return [p.title, p.slug, p.content, p.status, p.published_at, file_url(p.featured_image),
                p.meta_title, p.meta_description, p.author.email if p.author else ""]

    def build(self, db, v, earlier):
        payload = self.validate({
            "title": v.get("title", "").strip(),
            "slug": blank(v.get("slug")),
            "content": blank(v.get("content")),
            "status": to_publish_status(v.get("status")),
            "published_at": to_datetime(v.get("published_at"), "published_at"),
            "featured_image": blank(v.get("featured_image")),
            "meta_title": blank(v.get("meta_title")),
            "meta_description": blank(v.get("meta_description")),
        })
        if not payload.content:
            raise RowError("content: is required")
        return Prepared(payload, normalize_slug(payload.slug or payload.title), payload.title)

    def find_existing(self, db, p):
        return db.query(Page).filter(Page.slug == p.identity, Page.not_deleted()).first()

    def check(self, db, p):
        self.run(page_service._prepare, db, p.payload)

    def save(self, db, p, existing, user):
        data = self.run(page_service._prepare, db, p.payload, existing.id if existing else None)
        row = existing or Page(author_id=user.id)
        for key, value in data.items():
            setattr(row, key, value)
        db.add(row)
        return row


class TestimonialTransfer(TransferType):
    key, label, noun, subject = "testimonials", "Testimonials", "testimonials", "testimonial"
    view_perm, create_perm, update_perm = P.TESTIMONIALS_VIEW, P.TESTIMONIALS_CREATE, P.TESTIMONIALS_UPDATE
    schema = TestimonialCreateSchema
    rename = {"is_featured": "featured"}
    columns = [
        Col("name", "Client name", "Priya Nair", True),
        Col("designation", "Their role", "Head of Product"),
        Col("company", "Their company", "Finlytic"),
        Col("quote", "What they said (10–2000 characters)", "Great to work with, fast and reliable.", True),
        Col("rating", "1–5 stars, or empty", "5"),
        Col("featured", "yes or no (default no)", "no"),
        Col("sort_order", "Number, lower comes first (default 0)", "0"),
        Col("status", "active or inactive (default active)", "active"),
        Col("photo", "Photo URL (kept as a link)", ""),
    ]

    def export_query(self, db):
        return db.query(Testimonial).filter(Testimonial.not_deleted()).order_by(Testimonial.sort_order, Testimonial.id)

    def export_row(self, t):
        return [t.name, t.designation, t.company, t.quote, t.rating, bool(t.is_featured), t.sort_order, t.status,
                file_url(t.photo)]

    def build(self, db, v, earlier):
        payload = self.validate({
            "name": v.get("name", "").strip(),
            "designation": blank(v.get("designation")),
            "company": blank(v.get("company")),
            "quote": v.get("quote", "").strip(),
            "photo": blank(v.get("photo")),
            "rating": to_int(v.get("rating"), "rating"),
            "is_featured": to_bool(v.get("featured")),
            "sort_order": to_int(v.get("sort_order"), "sort_order") or 0,
            "status": to_status(v.get("status")),
        })
        return Prepared(payload, payload.name.strip().lower(), payload.name)

    def find_existing(self, db, p):
        return (db.query(Testimonial)
                .filter(func.lower(Testimonial.name) == p.identity, Testimonial.not_deleted())
                .order_by(Testimonial.id).first())

    def save(self, db, p, existing, user):
        data = testimonial_service._prepare(p.payload)
        row = existing or Testimonial()
        for key, value in data.items():
            setattr(row, key, value)
        db.add(row)
        return row


class RedirectTransfer(TransferType):
    key, label, noun, subject = "redirects", "Redirects", "redirects", "redirect"
    view_perm, create_perm, update_perm = P.REDIRECTS_VIEW, P.REDIRECTS_CREATE, P.REDIRECTS_UPDATE
    schema = RedirectCreateSchema
    rename = {"source_path": "old_url", "target_url": "new_url", "status_code": "type"}
    columns = [
        Col("old_url", "Path on this site that should redirect", "/old-page", True),
        Col("new_url", "Path on this site or full URL to send visitors to", "/new-page", True),
        Col("type", "301 (permanent, default), 302, 307 or 308", "301"),
        Col("status", "active or inactive (default active)", "active"),
        Col("note", "Why it exists (optional)", "Renamed in 2026"),
    ]
    export_extra = ["hits", "last_hit_at"]

    def export_query(self, db):
        return db.query(Redirect).order_by(Redirect.source_path)

    def export_row(self, r):
        return [r.source_path, r.target_url, r.status_code, r.status, r.note, r.hits, r.last_hit_at]

    def build(self, db, v, earlier):
        payload = self.validate({
            "source_path": v.get("old_url", ""),
            "target_url": v.get("new_url", ""),
            "status_code": to_int(v.get("type"), "type") or 301,
            "status": to_status(v.get("status")),
            "note": blank(v.get("note")),
        })
        source = self.run(redirect_service.clean_source, payload.source_path)
        return Prepared(payload, source, f"{source} → {payload.target_url}")

    def find_existing(self, db, p):
        return db.query(Redirect).filter(Redirect.source_path == p.identity).first()

    def check(self, db, p):
        self.run(redirect_service._prepare, db, p.payload)

    def save(self, db, p, existing, user):
        data = self.run(redirect_service._prepare, db, p.payload, existing.id if existing else None)
        row = existing or Redirect()
        for key, value in data.items():
            setattr(row, key, value)
        db.add(row)
        return row


class SeoTransfer(TransferType):
    key, label, noun, subject = "seo", "SEO pages", "SEO entries", "seo_page"
    view_perm, create_perm, update_perm = P.SEO_VIEW, P.SEO_CREATE, P.SEO_UPDATE
    schema = SeoPageCreateSchema
    rename = {"allow_indexing": "index", "schema_markup": "schema"}
    columns = [
        Col("page", "Page name", "About us", True),
        Col("path", "URL path of the page (\"/\" for home, \"*\" for the site-wide default)", "/about", True),
        Col("meta_title", "Title in search results", "About us · My Company"),
        Col("meta_description", "Snippet in search results", "Who we are and what we do."),
        Col("meta_keywords", "Comma-separated keywords", ""),
        Col("og_image", "Social share image URL", ""),
        Col("canonical_url", "Canonical URL", ""),
        Col("index", "yes = search engines may index it (default yes)", "yes"),
        Col("schema", "JSON-LD structured data", ""),
        Col("faqs", "FAQs as JSON: [{\"question\":\"…\",\"answer\":\"…\"}]", ""),
        Col("header_scripts", "Scripts for <head>", ""),
        Col("footer_scripts", "Scripts before </body>", ""),
        Col("custom_css", "Page CSS", ""),
    ]

    def export_query(self, db):
        return db.query(SeoPage).order_by(SeoPage.path)

    def export_row(self, s):
        return [s.page, s.path, s.meta_title, s.meta_description, s.meta_keywords, file_url(s.og_image),
                s.canonical_url, bool(s.allow_indexing), s.schema_markup, s.faqs or "", s.header_scripts,
                s.footer_scripts, s.custom_css]

    def build(self, db, v, earlier):
        faqs_raw = (v.get("faqs") or "").strip()
        try:
            faqs = json.loads(faqs_raw) if faqs_raw else []
        except ValueError:
            raise RowError("faqs: must be JSON, e.g. [{\"question\":\"…\",\"answer\":\"…\"}]")
        payload = self.validate({
            "page": v.get("page", ""),
            "path": v.get("path", ""),
            "meta_title": v.get("meta_title"),
            "meta_description": v.get("meta_description"),
            "meta_keywords": v.get("meta_keywords"),
            "og_image": v.get("og_image"),
            "canonical_url": v.get("canonical_url"),
            "schema_markup": v.get("schema"),
            "header_scripts": v.get("header_scripts"),
            "footer_scripts": v.get("footer_scripts"),
            "custom_css": v.get("custom_css"),
            "faqs": faqs,
            "allow_indexing": to_bool(v.get("index"), True),
        })
        path = seo_service.clean_path(payload.path)
        return Prepared(payload, path, f"{payload.page} ({path})")

    def find_existing(self, db, p):
        return db.query(SeoPage).filter(SeoPage.path == p.identity).first()

    def check(self, db, p):
        self.run(seo_service._prepare, db, p.payload)

    def save(self, db, p, existing, user):
        data = self.run(seo_service._prepare, db, p.payload, existing, user)
        row = existing or SeoPage()
        for key, value in data.items():
            setattr(row, key, value)
        db.add(row)
        return row


class UserTransfer(TransferType):
    key, label, noun, subject = "users", "Users", "users", "user"
    view_perm = P.USERS_VIEW
    columns = [Col("name", "Name"), Col("email", "Email"), Col("phone", "Phone"), Col("role", "Role"),
               Col("status", "active or inactive"), Col("last_login_at", "Last sign-in"),
               Col("created_at", "Account created")]

    def export_query(self, db):
        return db.query(User).options(joinedload(User.role)).filter(User.not_deleted()).order_by(User.name)

    def export_row(self, u):
        return [u.name, u.email, u.phone, u.role.name if u.role else "", u.status, u.last_login_at, u.created_at]


class EnquiryTransfer(TransferType):
    key, label, noun, subject = "enquiries", "Enquiries", "enquiries", "enquiry"
    view_perm = P.ENQUIRIES_VIEW
    columns = [Col("reference", "Enquiry number"), Col("received", "When it arrived"), Col("name", "Name"),
               Col("email", "Email"), Col("phone", "Phone"), Col("company", "Company"), Col("subject", "Subject"),
               Col("message", "Message"), Col("status", "Status"), Col("source", "Where it came from"),
               Col("page", "Page the form was sent from"), Col("assigned_to", "Team member handling it"),
               Col("follow_up", "Follow-up date"), Col("notes", "Number of notes"), Col("last_note", "Most recent note")]

    def export_query(self, db):
        return (db.query(Enquiry).options(joinedload(Enquiry.assignee), selectinload(Enquiry.activities))
                .filter(Enquiry.not_deleted()).order_by(Enquiry.id.desc()))

    def export_row(self, e):
        notes = [a for a in e.activities if a.type == "note"]
        return [e.reference, e.created_at, e.name, e.email, e.phone, e.company, e.subject, e.message,
                e.status.replace("_", " "), e.source, e.source_url, e.assignee.name if e.assignee else "",
                e.follow_up_at.date() if e.follow_up_at else "", len(notes), notes[0].body if notes else ""]


class NotFoundTransfer(TransferType):
    key, label, noun, subject = "not_found", "404 log", "404 entries", "not_found"
    view_perm = P.NOT_FOUND_VIEW
    columns = [Col("url", "Path that was not found"), Col("hits", "How many times"), Col("first_seen", "First time"),
               Col("last_seen", "Last time"), Col("came_from", "Last referring page"), Col("ignored", "yes if ignored")]

    def export_query(self, db):
        return db.query(NotFoundLog).order_by(NotFoundLog.hits.desc(), NotFoundLog.id)

    def export_row(self, n):
        return [n.path, n.hits, n.first_seen_at, n.last_seen_at, n.last_referrer, bool(n.ignored)]


TYPES: dict[str, TransferType] = {
    t.key: t
    for t in (BlogTransfer(), BlogCategoryTransfer(), PageTransfer(), TestimonialTransfer(), RedirectTransfer(),
              SeoTransfer(), UserTransfer(), EnquiryTransfer(), NotFoundTransfer())
}
