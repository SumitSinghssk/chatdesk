from sqlalchemy import Column, DateTime

from app.shared.utils.datetime import now


class TimestampMixin:
    created_at = Column(DateTime, default=now, nullable=False)
    updated_at = Column(DateTime, default=now, onupdate=now, nullable=False)


class SoftDeleteMixin:

    deleted_at = Column(DateTime, nullable=True, index=True)

    @classmethod
    def not_deleted(cls):
        return cls.deleted_at.is_(None)
