from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.enums import PublishStatus
from app.shared.mixins import SoftDeleteMixin, TimestampMixin


class Page(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "pages"
    __table_args__ = (
        Index("uq_pages_slug_live", "slug", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    slug = Column(String(280), nullable=False, index=True)
    content = Column(Text, nullable=True)
    featured_image = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default=PublishStatus.DRAFT.value, index=True)
    published_at = Column(DateTime, nullable=True)
    meta_title = Column(String(255), nullable=True)
    meta_description = Column(String(500), nullable=True)

    author = relationship("User")
