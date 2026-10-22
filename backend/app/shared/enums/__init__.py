import enum


class BaseEnum(str, enum.Enum):
    @classmethod
    def values(cls) -> list[str]:
        return [e.value for e in cls]


class Status(BaseEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class PublishStatus(BaseEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class EnquiryStatus(BaseEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    REPLIED = "replied"
    ON_HOLD = "on_hold"
    CLOSED = "closed"
    SPAM = "spam"


class CommentStatus(BaseEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SPAM = "spam"


class GalleryItemType(BaseEnum):
    IMAGE = "image"
    YOUTUBE = "youtube"
