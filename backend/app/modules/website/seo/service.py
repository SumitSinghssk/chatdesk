from sqlalchemy.orm import Session

from app.modules.admin.seo.models import DEFAULT_SEO_PATH, SeoPage
from app.modules.admin.seo.service import clean_path

FIELDS = (
    "page", "meta_title", "meta_description", "meta_keywords", "og_image", "canonical_url",
    "schema_markup", "header_scripts", "footer_scripts", "custom_css", "faqs", "allow_indexing",
)
FALLBACK_FIELDS = ("meta_title", "meta_description", "meta_keywords", "og_image")


def by_path(db: Session, path: str):
    clean = clean_path(path)
    rows = {r.path: r for r in db.query(SeoPage).filter(SeoPage.path.in_([clean, DEFAULT_SEO_PATH])).all()}
    matched = rows.get(clean)
    default = rows.get(DEFAULT_SEO_PATH)
    source = matched or default
    if source is None:
        return {"status": True, "data": None}

    data = {field: getattr(source, field) for field in FIELDS}
    data["faqs"] = data["faqs"] or []
    if matched and default:
        for field in FALLBACK_FIELDS:
            if not data.get(field):
                data[field] = getattr(default, field)
    data["matched_path"] = source.path
    return {"status": True, "data": data}
