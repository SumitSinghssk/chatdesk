import re
from typing import Callable

from fastapi import HTTPException, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dependencies import has_permission
from app.modules.admin.blog_categories.models import BlogCategory
from app.modules.admin.blogs.models import Blog
from app.modules.admin.enquiries.models import Enquiry
from app.modules.admin.galleries.models import Gallery
from app.modules.admin.pages.models import Page
from app.modules.admin.redirects.models import Redirect
from app.modules.admin.seo.models import SeoPage
from app.modules.admin.team_members.models import TeamMember
from app.modules.customer.account.models import Customer
from app.modules.admin.testimonials.models import Testimonial
from app.modules.admin.users.models import User
from app.shared.constants import permissions as P
from app.shared.utils.search import clean_search_text, search_clause
from app.shared.constants import admin_urls as urls
from app.shared.constants.admin_urls import admin_url

PER_TYPE = 5
MIN_LENGTH = 2
_ENQUIRY_REF = re.compile(r"^(?:enq-?)?0*(\d{1,9})$", re.IGNORECASE)


def _item(id_: int, title: str | None, subtitle: str | None, url: str) -> dict:
    return {"id": id_, "title": title or "(untitled)", "subtitle": subtitle, "url": url}


def _rows(db: Session, model, columns, q: str, *filters, extra=None, order=None):
    clause = search_clause(columns, q)
    if extra is not None:
        clause = or_(clause, extra) if clause is not None else extra
    query = db.query(model).filter(clause, *filters)
    return query.order_by(order if order is not None else model.id.desc()).limit(PER_TYPE).all()


def _users(db: Session, q: str):
    rows = _rows(db, User, [User.name, User.email, User.phone], q, User.not_deleted())
    return [_item(r.id, r.name, r.email, admin_url(urls.USERS, open=r.id)) for r in rows]


def _customers(db: Session, q: str):
    rows = _rows(db, Customer, [Customer.name, Customer.email, Customer.phone], q, Customer.not_deleted(),
                 Customer.parent_id.is_(None))
    return [_item(r.id, r.name or r.email or r.phone or f"Customer #{r.id}", r.email or r.phone,
                  admin_url(urls.CUSTOMERS, open=r.id)) for r in rows]


def _blogs(db: Session, q: str):
    rows = _rows(db, Blog, [Blog.title, Blog.slug], q, Blog.not_deleted())
    return [_item(r.id, r.title, f"/{r.slug} · {r.status}", admin_url(urls.BLOGS, open=r.id)) for r in rows]


def _blog_categories(db: Session, q: str):
    rows = _rows(db, BlogCategory, [BlogCategory.name, BlogCategory.slug], q, BlogCategory.not_deleted())
    return [_item(r.id, r.name, r.slug, admin_url(urls.BLOG_CATEGORIES, focus=r.id)) for r in rows]


def _pages(db: Session, q: str):
    rows = _rows(db, Page, [Page.title, Page.slug], q, Page.not_deleted())
    return [_item(r.id, r.title, f"/{r.slug} · {r.status}", admin_url(urls.PAGES, open=r.id)) for r in rows]


def _enquiries(db: Session, q: str):
    ref = _ENQUIRY_REF.match(q.replace(" ", ""))
    rows = _rows(
        db, Enquiry,
        [Enquiry.name, Enquiry.email, Enquiry.phone, Enquiry.company, Enquiry.subject], q,
        Enquiry.not_deleted(),
        extra=(Enquiry.id == int(ref.group(1))) if ref else None,
    )
    return [_item(r.id, r.name, f"{r.reference} · {r.subject or r.email or r.status}",
                  admin_url(urls.ENQUIRIES, enquiry=r.id)) for r in rows]


def _testimonials(db: Session, q: str):
    rows = _rows(db, Testimonial, [Testimonial.name, Testimonial.company, Testimonial.designation], q,
                 Testimonial.not_deleted())
    return [_item(r.id, r.name, ", ".join(x for x in (r.designation, r.company) if x) or None,
                  admin_url(urls.TESTIMONIALS, focus=r.id)) for r in rows]


def _team(db: Session, q: str):
    rows = _rows(db, TeamMember, [TeamMember.name, TeamMember.designation, TeamMember.department], q,
                 TeamMember.not_deleted())
    return [_item(r.id, r.name, " · ".join(x for x in (r.designation, r.department) if x) or None,
                  admin_url(urls.TEAM, focus=r.id)) for r in rows]


def _galleries(db: Session, q: str):
    rows = _rows(db, Gallery, [Gallery.title, Gallery.slug], q)
    return [_item(r.id, r.title, r.slug, admin_url(urls.GALLERIES, open=r.id)) for r in rows]


def _redirects(db: Session, q: str):
    rows = _rows(db, Redirect, [Redirect.source_path, Redirect.target_url], q)
    return [_item(r.id, r.source_path, f"{r.status_code} → {r.target_url}", admin_url(urls.REDIRECTS, focus=r.id))
            for r in rows]


def _seo_pages(db: Session, q: str):
    rows = _rows(db, SeoPage, [SeoPage.page, SeoPage.path, SeoPage.meta_title], q)
    return [_item(r.id, r.page, r.path, admin_url(urls.SEO, focus=r.id)) for r in rows]


SOURCES: list[tuple[str, str, str, Callable]] = [
    ("users", "Users", P.USERS_VIEW, _users),
    ("customers", "Customers", P.CUSTOMERS_VIEW, _customers),
    ("enquiries", "Enquiries", P.ENQUIRIES_VIEW, _enquiries),
    ("blogs", "Blogs", P.BLOGS_VIEW, _blogs),
    ("blog_categories", "Blog categories", P.BLOG_CATEGORIES_VIEW, _blog_categories),
    ("pages", "Pages", P.PAGES_VIEW, _pages),
    ("testimonials", "Testimonials", P.TESTIMONIALS_VIEW, _testimonials),
    ("team", "Team members", P.TEAM_VIEW, _team),
    ("galleries", "Galleries", P.GALLERIES_VIEW, _galleries),
    ("redirects", "Redirects", P.REDIRECTS_VIEW, _redirects),
    ("seo", "SEO pages", P.SEO_VIEW, _seo_pages),
]


def search(db: Session, request: Request, q: str | None):
    term = clean_search_text(q)
    if len(term) < MIN_LENGTH:
        msg = f"Type at least {MIN_LENGTH} characters to search"
        raise HTTPException(status_code=422, detail={"message": msg, "errors": {"q": [msg]}})
    term = term[:100]
    groups = []
    for type_, label, permission, finder in SOURCES:
        if not has_permission(request, permission):
            continue
        items = finder(db, term)
        if items:
            groups.append({"type": type_, "label": label, "items": items})
    return {"status": True, "data": groups}
