from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class Backup(Base, TimestampMixin):

    __tablename__ = "backups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    trigger = Column(String(20), nullable=False, default="manual")
    includes_database = Column(Boolean, nullable=False, default=True)
    includes_files = Column(Boolean, nullable=False, default=True)
    status = Column(String(20), nullable=False, default="running", index=True)
    stage = Column(String(50), nullable=True)
    parts = Column(JSON, nullable=True)
    size = Column(BigInteger, nullable=False, default=0)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
