from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class WorkbookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)


class WorkbookUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)


class WorkbookRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID | None = None
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class WorkbookList(BaseModel):
    items: list[WorkbookRead]
    total: int
