from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin
from app.shared.utils.datetime import now

SUPER_ADMIN_ROLE = "super_admin"


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255), nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    requires_two_factor = Column(Boolean, nullable=False, default=False)

    role_permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    permissions = relationship("Permission", secondary="role_permissions", back_populates="roles", viewonly=True)
    users = relationship("User", back_populates="role")

    @property
    def is_super_admin(self) -> bool:
        return self.name == SUPER_ADMIN_ROLE


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),
        Index("ix_role_permissions_permission_id", "permission_id"),
    )

    id = Column(Integer, primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=now)

    role = relationship("Role", back_populates="role_permissions")
    permission = relationship("Permission", back_populates="role_permissions")
