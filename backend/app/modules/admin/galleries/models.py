from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.enums import GalleryItemType, Status
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now


class Gallery(Base, TimestampMixin):
    __tablename__ = "galleries"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    slug = Column(String(280), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    event_date = Column(Date, nullable=True)
    cover_image = Column(String(500), nullable=True)
    is_featured = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default=Status.ACTIVE.value, index=True)

    items = relationship(
        "GalleryItem",
        back_populates="gallery",
        cascade="all, delete-orphan",
        order_by="GalleryItem.sort_order",
    )


class GalleryItem(Base):
    __tablename__ = "gallery_items"

    id = Column(Integer, primary_key=True)
    gallery_id = Column(Integer, ForeignKey("galleries.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(20), nullable=False, default=GalleryItemType.IMAGE.value)
    path = Column(String(500), nullable=True)
    youtube_id = Column(String(20), nullable=True)
    title = Column(String(255), nullable=True)
    caption = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=now, nullable=False)

    gallery = relationship("Gallery", back_populates="items")
