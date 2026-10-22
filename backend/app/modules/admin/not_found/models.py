from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.core.database import Base
from app.shared.utils.datetime import now


class NotFoundLog(Base):

    __tablename__ = "not_found_logs"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String(500), unique=True, nullable=False, index=True)
    hits = Column(Integer, nullable=False, default=1)
    last_referrer = Column(String(1000), nullable=True)
    last_user_agent = Column(String(500), nullable=True)
    ignored = Column(Boolean, nullable=False, default=False, index=True)
    first_seen_at = Column(DateTime, default=now, nullable=False)
    last_seen_at = Column(DateTime, default=now, nullable=False, index=True)
