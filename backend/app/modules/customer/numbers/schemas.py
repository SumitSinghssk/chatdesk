from pydantic import BaseModel, Field, field_validator


class NumberSchema(BaseModel):
    label: str = Field(..., min_length=1, max_length=60)

    @field_validator("label", mode="before")
    @classmethod
    def _strip(cls, v):
        return " ".join(v.split()) if isinstance(v, str) else v


class DeleteNumberSchema(BaseModel):
    confirm: str = Field(..., max_length=20)
