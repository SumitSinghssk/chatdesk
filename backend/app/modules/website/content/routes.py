from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.website.content import service

router = APIRouter()


@router.get("/blogs")
def blogs(
    page: int | None = None,
    per_page: int | None = None,
    search: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_blogs(db, page, per_page, search, category)


@router.get("/blogs/{slug}")
def blog(slug: str, db: Session = Depends(get_db)):
    return service.get_blog(db, slug)


@router.get("/blog-categories")
def blog_categories(db: Session = Depends(get_db)):
    return service.list_categories(db)


@router.get("/pages/{slug}")
def page(slug: str, db: Session = Depends(get_db)):
    return service.get_page(db, slug)


@router.get("/testimonials")
def testimonials(db: Session = Depends(get_db)):
    return service.list_testimonials(db)


@router.get("/galleries")
def galleries(db: Session = Depends(get_db)):
    return service.list_galleries(db)


@router.get("/galleries/{slug}")
def gallery(slug: str, db: Session = Depends(get_db)):
    return service.get_gallery(db, slug)


@router.get("/sitemap")
def sitemap(db: Session = Depends(get_db)):
    return service.sitemap(db)
