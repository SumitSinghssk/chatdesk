from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class Permission(Base, TimestampMixin):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False, index=True)
    group = Column(String(100), nullable=True, index=True)
    description = Column(String(255), nullable=True)

    role_permissions = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")
    roles = relationship("Role", secondary="role_permissions", back_populates="permissions", viewonly=True)
    user_permissions = relationship("UserPermission", back_populates="permission", cascade="all, delete-orphan")
    users = relationship("User", secondary="user_permissions", back_populates="direct_permissions", viewonly=True)
