from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, SmallInteger, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.enums import Status
from app.shared.mixins import SoftDeleteMixin, TimestampMixin


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(20), nullable=True)
    password = Column(String(255), nullable=False)
    avatar = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    social_links = Column(JSON, nullable=True)
    status = Column(String(20), nullable=False, default=Status.ACTIVE.value, index=True)

    token_version = Column(Integer, nullable=False, default=1)

    two_factor_secret = Column(Text, nullable=True)
    two_factor_recovery_codes = Column(JSON, nullable=True)
    two_factor_confirmed_at = Column(DateTime, nullable=True)
    two_factor_last_step = Column(Integer, nullable=True)

    failed_logins = Column(SmallInteger, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)

    last_login_at = Column(DateTime, nullable=True)
    last_login_ip = Column(String(64), nullable=True)

    role = relationship("Role", back_populates="users")
    user_permissions = relationship("UserPermission", back_populates="user", cascade="all, delete-orphan")
    direct_permissions = relationship("Permission", secondary="user_permissions", back_populates="users", viewonly=True)
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")

    @property
    def is_super_admin(self) -> bool:
        return bool(self.role and self.role.is_super_admin)

    @property
    def two_factor_enabled(self) -> bool:
        return self.two_factor_confirmed_at is not None

    def permission_names(self) -> list[str]:
        if self.is_super_admin:
            return ["*"]
        names = {p.name for p in (self.direct_permissions or [])}
        if self.role:
            names.update(p.name for p in (self.role.permissions or []))
        return sorted(names)
