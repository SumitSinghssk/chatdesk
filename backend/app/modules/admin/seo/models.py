from sqlalchemy import JSON, Boolean, Column, Integer, String, Text

from app.core.database import Base
from app.shared.mixins import TimestampMixin

DEFAULT_SEO_PATH = "*"


class SeoPage(Base, TimestampMixin):

    __tablename__ = "seo_pages"

    id = Column(Integer, primary_key=True, index=True)
    page = Column(String(150), nullable=False)
    path = Column(String(500), unique=True, nullable=False, index=True)
    meta_title = Column(String(255), nullable=True)
    meta_description = Column(String(500), nullable=True)
    meta_keywords = Column(String(500), nullable=True)
    og_image = Column(String(500), nullable=True)
    canonical_url = Column(String(1000), nullable=True)
    schema_markup = Column(Text, nullable=True)
    header_scripts = Column(Text, nullable=True)
    footer_scripts = Column(Text, nullable=True)
    custom_css = Column(Text, nullable=True)
    faqs = Column(JSON, nullable=True)
    allow_indexing = Column(Boolean, nullable=False, default=True)
