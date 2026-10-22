from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.enums import Status
from app.shared.mixins import SoftDeleteMixin, TimestampMixin


class BlogCategory(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "blog_categories"
    __table_args__ = (
        Index("uq_blog_categories_slug_live", "slug", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("blog_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(150), nullable=False)
    slug = Column(String(180), nullable=False, index=True)
    description = Column(Text, nullable=True)
    image = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default=Status.ACTIVE.value, index=True)

    parent = relationship("BlogCategory", remote_side=[id])
    blogs = relationship("Blog", secondary="blog_category_blog", back_populates="categories", viewonly=True)
