from sqlalchemy import JSON, Boolean, Column, Integer, String, Text

from app.core.database import Base
from app.shared.enums import Status
from app.shared.mixins import SoftDeleteMixin, TimestampMixin


class TeamMember(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    designation = Column(String(150), nullable=True)
    department = Column(String(150), nullable=True, index=True)
    bio = Column(Text, nullable=True)
    photo = Column(String(500), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(30), nullable=True)
    social_links = Column(JSON, nullable=True)
    is_featured = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default=Status.ACTIVE.value, index=True)
