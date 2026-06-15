from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class AutomationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    workbook_id: UUID | None = None
    trigger_type: str = "manual"
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    actions: list[dict[str, Any]] = Field(default_factory=list)


class AutomationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    workbook_id: UUID | None
    name: str
    trigger_type: str
    trigger_config: dict[str, Any]
    actions: list[dict[str, Any]]
    enabled: bool
    last_fired_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ActionOutcomeRead(BaseModel):
    action_type: str
    ok: bool
    detail: str | None


class RunResponse(BaseModel):
    automation_id: UUID
    outcomes: list[ActionOutcomeRead]
    all_ok: bool
