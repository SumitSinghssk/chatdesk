from sqlalchemy import JSON, Column, Integer, String

from app.core.database import Base
from app.shared.mixins import TimestampMixin


class Setting(Base, TimestampMixin):

    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(JSON, nullable=True)
