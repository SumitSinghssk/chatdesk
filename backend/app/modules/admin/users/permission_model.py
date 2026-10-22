from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.utils.datetime import now


class UserPermission(Base):

    __tablename__ = "user_permissions"
    __table_args__ = (
        UniqueConstraint("user_id", "permission_id", name="uq_user_permissions_user_permission"),
        Index("ix_user_permissions_permission_id", "permission_id"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=now)

    user = relationship("User", back_populates="user_permissions")
    permission = relationship("Permission", back_populates="user_permissions")
