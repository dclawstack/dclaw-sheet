from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class PlanStepCreate(BaseModel):
    tool: str = Field(min_length=1, max_length=64)
    args: dict[str, Any] = Field(default_factory=dict)


class PlanCreate(BaseModel):
    goal: str = Field(min_length=1, max_length=2048)
    workbook_id: UUID | None = None
    sheet_id: UUID | None = None
    steps: list[PlanStepCreate] = Field(default_factory=list)


class PlanStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    position: int
    tool: str
    args: dict[str, Any]
    status: str
    result: dict[str, Any] | None
    error: str | None
    attempts: int
    started_at: datetime | None
    completed_at: datetime | None


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    workbook_id: UUID | None
    sheet_id: UUID | None
    goal: str
    status: str
    actor_email: str | None
    created_at: datetime
    updated_at: datetime
    steps: list[PlanStepRead]
