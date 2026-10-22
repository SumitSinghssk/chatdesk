from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Table, Text, UniqueConstraint, text, true
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.enums import PublishStatus
from app.shared.mixins import SoftDeleteMixin, TimestampMixin

blog_category_blog = Table(
    "blog_category_blog",
    Base.metadata,
    Column("id", Integer, primary_key=True),
    Column("blog_id", Integer, ForeignKey("blogs.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("blog_category_id", Integer, ForeignKey("blog_categories.id", ondelete="CASCADE"), nullable=False, index=True),
    UniqueConstraint("blog_id", "blog_category_id", name="uq_blog_category_blog_pair"),
)


class Blog(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "blogs"
    __table_args__ = (
        Index("uq_blogs_slug_live", "slug", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    slug = Column(String(280), nullable=False, index=True)
    excerpt = Column(String(500), nullable=True)
    content = Column(Text, nullable=True)
    featured_image = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default=PublishStatus.DRAFT.value, index=True)
    published_at = Column(DateTime, nullable=True, index=True)
    meta_title = Column(String(255), nullable=True)
    meta_description = Column(String(500), nullable=True)
    comments_enabled = Column(Boolean, nullable=False, default=True, server_default=true())

    author = relationship("User")
    categories = relationship("BlogCategory", secondary=blog_category_blog, back_populates="blogs")
