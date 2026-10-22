import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class BackupCreateSchema(BaseModel):
    include_database: bool = True
    include_files: bool = True


class BackupSettingsSchema(BaseModel):
    enabled: bool = False
    frequency: Literal["daily", "weekly", "monthly"] = "daily"
    time: str = "02:00"
    weekday: int = Field(1, ge=1, le=7)
    monthday: int = Field(1, ge=1, le=28)
    include_database: bool = True
    include_files: bool = True
    keep: int = Field(7, ge=1, le=60)

    @field_validator("time")
    @classmethod
    def _time(cls, value: str) -> str:
        match = re.fullmatch(r"(\d{1,2}):(\d{2})", (value or "").strip())
        if not match or int(match.group(1)) > 23 or int(match.group(2)) > 59:
            raise ValueError("Enter the time as HH:MM, for example 02:30.")
        return f"{int(match.group(1)):02d}:{match.group(2)}"
