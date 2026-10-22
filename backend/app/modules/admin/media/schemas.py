from typing import Literal, Optional

from pydantic import BaseModel, Field

MediaSort = Literal["newest", "oldest", "largest", "smallest", "name"]
MediaType = Literal["image", "document"]


class MediaUpdateSchema(BaseModel):
    alt: Optional[str] = Field(None, max_length=255)
