from datetime import timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.modules.admin.activity_log.models import ActivityLog
from app.modules.admin.blogs.models import Blog
from app.modules.admin.enquiries.models import Enquiry
from app.modules.admin.pages.models import Page
from app.modules.admin.testimonials.models import Testimonial
from app.modules.admin.users.models import User
from app.shared.enums import EnquiryStatus, PublishStatus, Status
from app.shared.utils.datetime import day_start, iso, now, site_now, site_zone

CHART_DAYS = 14


def _count(db: Session, model, *filters) -> int:
    return db.query(func.count(model.id)).filter(*filters).scalar() or 0


def _blank(column):
    return or_(column.is_(None), func.trim(column) == "")


def _stats(db: Session) -> dict:
    current = now()
    week_ago = current - timedelta(days=7)
    two_weeks_ago = current - timedelta(days=14)
    live_enquiry = Enquiry.not_deleted()
    return {
        "enquiries_this_week": _count(db, Enquiry, live_enquiry, Enquiry.created_at >= week_ago),
        "enquiries_prev_week": _count(db, Enquiry, live_enquiry, Enquiry.created_at >= two_weeks_ago,
                                      Enquiry.created_at < week_ago),
        "unread_enquiries": _count(db, Enquiry, live_enquiry, Enquiry.status == EnquiryStatus.NEW.value,
                                   Enquiry.seen_at.is_(None)),
        "published_blogs": _count(db, Blog, Blog.not_deleted(), Blog.status == PublishStatus.PUBLISHED.value),
        "draft_blogs": _count(db, Blog, Blog.not_deleted(), Blog.status == PublishStatus.DRAFT.value),
        "published_pages": _count(db, Page, Page.not_deleted(), Page.status == PublishStatus.PUBLISHED.value),
        "active_users": _count(db, User, User.not_deleted(), User.status == Status.ACTIVE.value),
        "testimonials": _count(db, Testimonial, Testimonial.not_deleted()),
    }


def _enquiries_chart(db: Session) -> list[dict]:
    zone = site_zone()
    start = site_now().date() - timedelta(days=CHART_DAYS - 1)
    day = func.date(func.timezone(zone.key, func.timezone("UTC", Enquiry.created_at)))
    rows = (
        db.query(day, func.count(Enquiry.id))
        .filter(Enquiry.not_deleted(), Enquiry.created_at >= day_start(start, zone))
        .group_by(day)
        .all()
    )
    totals = {d.isoformat() if hasattr(d, "isoformat") else str(d): n for d, n in rows}
    days = [(start + timedelta(days=i)).isoformat() for i in range(CHART_DAYS)]
    return [{"date": d, "total": totals.get(d, 0)} for d in days]


def _recent_enquiries(db: Session) -> list[dict]:
    rows = db.query(Enquiry).filter(Enquiry.not_deleted()).order_by(Enquiry.id.desc()).limit(5).all()
    return [{"id": r.id, "reference": r.reference, "name": r.name, "subject": r.subject,
             "status": r.status, "created_at": iso(r.created_at)} for r in rows]


def _latest_blogs(db: Session) -> list[dict]:
    rows = db.query(Blog).filter(Blog.not_deleted()).order_by(Blog.updated_at.desc()).limit(5).all()
    return [{"id": r.id, "title": r.title, "slug": r.slug, "status": r.status,
             "published_at": iso(r.published_at)} for r in rows]


def _recent_activity(db: Session) -> list[dict]:
    rows = (
        db.query(ActivityLog)
        .options(joinedload(ActivityLog.user))
        .order_by(ActivityLog.id.desc())
        .limit(8)
        .all()
    )
    return [{"id": r.id, "action": r.action, "description": r.description, "subject_type": r.subject_type,
             "subject_label": r.subject_label, "user": r.user.name if r.user else r.user_email,
             "created_at": iso(r.created_at)} for r in rows]


def _content_health(db: Session) -> dict:
    return {
        "blogs_without_image": _count(db, Blog, Blog.not_deleted(), _blank(Blog.featured_image)),
        "blogs_without_meta_description": _count(db, Blog, Blog.not_deleted(), _blank(Blog.meta_description)),
        "pages_without_meta_description": _count(db, Page, Page.not_deleted(), _blank(Page.meta_description)),
    }


def overview(db: Session, user: User) -> dict:
    return {
        "status": True,
        "data": {
            "greeting_name": (user.name or "").split(" ")[0] or user.name,
            "stats": _stats(db),
            "enquiries_chart": _enquiries_chart(db),
            "recent_enquiries": _recent_enquiries(db),
            "latest_blogs": _latest_blogs(db),
            "recent_activity": _recent_activity(db),
            "content_health": _content_health(db),
        },
    }
