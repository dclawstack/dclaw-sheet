from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class SheetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    position: int = Field(default=0, ge=0)
    row_count: int = Field(default=100, ge=1, le=10_000)
    column_count: int = Field(default=26, ge=1, le=1_000)


class SheetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    position: int | None = Field(default=None, ge=0)
    row_count: int | None = Field(default=None, ge=1, le=10_000)
    column_count: int | None = Field(default=None, ge=1, le=1_000)


class SheetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workbook_id: UUID
    name: str
    position: int
    row_count: int
    column_count: int
    created_at: datetime
    updated_at: datetime
