from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.modules.admin.blog_categories.models import BlogCategory
from app.modules.admin.blogs.models import Blog, blog_category_blog
from app.modules.admin.galleries.models import Gallery
from app.modules.admin.galleries.service import serialize_item
from app.modules.admin.pages.models import Page
from app.modules.admin.testimonials.models import Testimonial
from app.shared.enums import GalleryItemType, PublishStatus, Status
from app.shared.pagination import list_response
from app.shared.utils.datetime import iso, now
from app.shared.utils.search import search_clause

STATIC_PATHS = ["/", "/blog", "/gallery", "/contact", "/team"]


def _published_blogs(db: Session):
    return db.query(Blog).filter(
        Blog.not_deleted(),
        Blog.status == PublishStatus.PUBLISHED.value,
        Blog.published_at <= now(),
    )


def _published_pages_filter():
    return (
        Page.not_deleted(),
        Page.status == PublishStatus.PUBLISHED.value,
        or_(Page.published_at.is_(None), Page.published_at <= now()),
    )


def _blog(row: Blog, with_content: bool = False) -> dict:
    data = {
        "id": row.id,
        "title": row.title,
        "slug": row.slug,
        "excerpt": row.excerpt,
        "featured_image": row.featured_image,
        "published_at": iso(row.published_at),
        "updated_at": iso(row.updated_at),
        "meta_title": row.meta_title,
        "meta_description": row.meta_description,
        "comments_enabled": row.comments_enabled,
        "author": {"name": row.author.name} if row.author else None,
        "categories": [
            {"id": c.id, "name": c.name, "slug": c.slug}
            for c in row.categories if c.deleted_at is None and c.status == Status.ACTIVE.value
        ],
    }
    if with_content:
        data["content"] = row.content
    return data


def list_blogs(db: Session, page=None, per_page=None, search=None, category=None):
    q = _published_blogs(db).options(joinedload(Blog.author), selectinload(Blog.categories))
    clause = search_clause([Blog.title, Blog.excerpt], search)
    if clause is not None:
        q = q.filter(clause)
    if category:
        q = q.join(Blog.categories).filter(BlogCategory.slug == category, BlogCategory.not_deleted())
    q = q.order_by(Blog.published_at.desc(), Blog.id.desc())
    return list_response(q, _blog, page or 1, per_page or 9, search)


def get_blog(db: Session, slug: str):
    row = (
        _published_blogs(db)
        .options(joinedload(Blog.author), selectinload(Blog.categories))
        .filter(Blog.slug == slug)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")

    data = _blog(row, with_content=True)
    category_ids = [c["id"] for c in data["categories"]]
    related_q = _published_blogs(db).filter(Blog.id != row.id)
    if category_ids:
        related_q = related_q.join(Blog.categories).filter(BlogCategory.id.in_(category_ids)).distinct()
    related = related_q.order_by(Blog.published_at.desc()).limit(3).all()
    data["related"] = [_blog(r) for r in related]
    return {"status": True, "data": data}


def list_categories(db: Session):
    counts = (
        db.query(blog_category_blog.c.blog_category_id, func.count().label("total"))
        .join(Blog, Blog.id == blog_category_blog.c.blog_id)
        .filter(Blog.not_deleted(), Blog.status == PublishStatus.PUBLISHED.value, Blog.published_at <= now())
        .group_by(blog_category_blog.c.blog_category_id)
        .subquery()
    )
    rows = (
        db.query(BlogCategory, func.coalesce(counts.c.total, 0))
        .outerjoin(counts, counts.c.blog_category_id == BlogCategory.id)
        .filter(BlogCategory.not_deleted(), BlogCategory.status == Status.ACTIVE.value)
        .order_by(BlogCategory.name)
        .all()
    )
    return {"status": True, "data": [
        {"id": c.id, "name": c.name, "slug": c.slug, "description": c.description, "posts_count": total}
        for c, total in rows
    ]}


def get_page(db: Session, slug: str):
    row = db.query(Page).filter(Page.slug == slug, *_published_pages_filter()).first()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"status": True, "data": {
        "id": row.id, "title": row.title, "slug": row.slug, "content": row.content,
        "featured_image": row.featured_image, "meta_title": row.meta_title,
        "meta_description": row.meta_description, "published_at": iso(row.published_at),
        "updated_at": iso(row.updated_at),
    }}


def list_testimonials(db: Session):
    rows = (
        db.query(Testimonial)
        .filter(Testimonial.not_deleted(), Testimonial.status == Status.ACTIVE.value)
        .order_by(Testimonial.is_featured.desc(), Testimonial.sort_order, Testimonial.id.desc())
        .all()
    )
    return {"status": True, "data": [
        {"id": r.id, "name": r.name, "designation": r.designation, "company": r.company,
         "quote": r.quote, "photo": r.photo, "rating": r.rating, "is_featured": r.is_featured}
        for r in rows
    ]}


def _gallery_card(row: Gallery) -> dict:
    images = [i for i in row.items if i.type == GalleryItemType.IMAGE.value]
    cover = row.cover_image or (images[0].path if images else None)
    if not cover and row.items:
        cover = serialize_item(row.items[0])["thumbnail"]
    return {
        "id": row.id, "title": row.title, "slug": row.slug, "description": row.description,
        "event_date": row.event_date.isoformat() if row.event_date else None,
        "cover_image": cover, "items_count": len(row.items), "is_featured": row.is_featured,
    }


def _active_galleries(db: Session):
    return db.query(Gallery).options(selectinload(Gallery.items)).filter(Gallery.status == Status.ACTIVE.value)


def list_galleries(db: Session):
    rows = _active_galleries(db).order_by(Gallery.is_featured.desc(), Gallery.sort_order, Gallery.id.desc()).all()
    return {"status": True, "data": [_gallery_card(r) for r in rows]}


def get_gallery(db: Session, slug: str):
    row = _active_galleries(db).filter(Gallery.slug == slug).first()
    if not row:
        raise HTTPException(status_code=404, detail="Gallery not found")
    data = _gallery_card(row)
    data["items"] = [serialize_item(i) for i in sorted(row.items, key=lambda i: (i.sort_order, i.id))]
    return {"status": True, "data": data}


def sitemap(db: Session):
    entries = [{"path": p, "lastmod": None} for p in STATIC_PATHS]
    for slug, updated in _published_blogs(db).with_entities(Blog.slug, Blog.updated_at).all():
        entries.append({"path": f"/blog/{slug}", "lastmod": iso(updated)})
    pages = db.query(Page.slug, Page.updated_at).filter(*_published_pages_filter()).all()
    entries += [{"path": f"/{slug}", "lastmod": iso(updated)} for slug, updated in pages]
    galleries = db.query(Gallery.slug, Gallery.updated_at).filter(Gallery.status == Status.ACTIVE.value).all()
    entries += [{"path": f"/gallery/{slug}", "lastmod": iso(updated)} for slug, updated in galleries]
    return {"status": True, "data": entries}


