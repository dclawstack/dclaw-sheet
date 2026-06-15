from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_type: str
    user_id: str | None
    workbook_id: UUID | None
    sheet_id: UUID | None
    payload: dict[str, Any] | None
    created_at: datetime


class EventList(BaseModel):
    items: list[EventRead]
    total: int


class DailyCount(BaseModel):
    day: str
    count: int


class TypeCount(BaseModel):
    event_type: str
    count: int


class TelemetrySummary(BaseModel):
    total_events: int
    events_today: int
    daily_counts: list[DailyCount]
    by_type: list[TypeCount]
    daily_active_workbooks: list[DailyCount]
