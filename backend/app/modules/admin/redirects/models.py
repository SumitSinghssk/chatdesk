from sqlalchemy import Column, DateTime, Integer, SmallInteger, String

from app.core.database import Base
from app.shared.enums import Status
from app.shared.mixins import TimestampMixin


class Redirect(Base, TimestampMixin):
    __tablename__ = "redirects"

    id = Column(Integer, primary_key=True, index=True)
    source_path = Column(String(500), unique=True, nullable=False, index=True)
    target_url = Column(String(2048), nullable=False)
    status_code = Column(SmallInteger, nullable=False, default=301)
    status = Column(String(20), nullable=False, default=Status.ACTIVE.value, index=True)
    hits = Column(Integer, nullable=False, default=0)
    last_hit_at = Column(DateTime, nullable=True)
    note = Column(String(255), nullable=True)
