from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, false
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.enums import CommentStatus
from app.shared.mixins import TimestampMixin


class BlogComment(Base, TimestampMixin):
    __tablename__ = "blog_comments"
    __table_args__ = (Index("ix_blog_comments_blog_status", "blog_id", "status"),)

    id = Column(Integer, primary_key=True, index=True)
    blog_id = Column(Integer, ForeignKey("blogs.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("blog_comments.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    author_name = Column(String(120), nullable=False)
    author_email = Column(String(255), nullable=True, index=True)
    body = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default=CommentStatus.PENDING.value, index=True)
    is_admin = Column(Boolean, nullable=False, default=False, server_default=false())
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(500), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    blog = relationship("Blog")
    parent = relationship("BlogComment", remote_side=[id], back_populates="replies")
    replies = relationship("BlogComment", back_populates="parent", passive_deletes=True)
    user = relationship("User", foreign_keys=[user_id])
    approver = relationship("User", foreign_keys=[approved_by])
