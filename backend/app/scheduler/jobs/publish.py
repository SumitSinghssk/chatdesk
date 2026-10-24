from datetime import timedelta

from sqlalchemy.orm import Session

from app.shared.utils.datetime import now

NAME = "publish"
DESCRIPTION = "Refreshes the website cache when a scheduled blog post or page goes live."
CADENCE = "every minute"
SCHEDULE = "* * * * *"


def run(db: Session, force: bool = False) -> str:
    from app.core.cache import invalidate
    from app.modules.admin.blogs.models import Blog
    from app.modules.admin.pages.models import Page

    current = now()
    window_start = current - timedelta(minutes=2)
    went_live = sum(
        db.query(model).filter(model.not_deleted(), model.status == "published",
                               model.published_at > window_start, model.published_at <= current).count()
        for model in (Blog, Page)
    )
    if not went_live and not force:
        return "nothing scheduled went live"
    invalidate("blogs", "pages", "sitemap", wait=True)
    return f"{went_live} scheduled item(s) went live; website cache refreshed"
