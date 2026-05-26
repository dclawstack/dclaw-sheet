from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.database import get_db
from app.core.utils import utc_now
from app.repositories.event_repo import EventRepository
from app.schemas.event import (
    DailyCount,
    EventList,
    EventRead,
    TelemetrySummary,
    TypeCount,
)

router = APIRouter()


@router.get("", response_model=EventList)
async def list_events(
    limit: int = Query(default=100, ge=1, le=1000),
    event_type: str | None = Query(default=None),
    workbook_id: UUID | None = Query(default=None),
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    repo = EventRepository(db)
    items, total = await repo.list_recent(
        workspace_id=scope.workspace.id,
        limit=limit,
        event_type=event_type,
        workbook_id=workbook_id,
    )
    return EventList(items=[EventRead.model_validate(i) for i in items], total=total)


@router.get("/summary", response_model=TelemetrySummary)
async def summary(
    days: int = Query(default=7, ge=1, le=90),
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    repo = EventRepository(db)
    ws_id = scope.workspace.id
    total = await repo.total(workspace_id=ws_id)
    today_start = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    events_today = await repo.count_since(today_start, workspace_id=ws_id)
    daily = await repo.daily_counts(workspace_id=ws_id, days=days)
    by_type = await repo.counts_by_type(workspace_id=ws_id, days=days)
    daw = await repo.daily_active_workbooks(workspace_id=ws_id, days=days)
    return TelemetrySummary(
        total_events=total,
        events_today=events_today,
        daily_counts=[DailyCount(day=d, count=c) for d, c in daily],
        by_type=[TypeCount(event_type=t, count=c) for t, c in by_type],
        daily_active_workbooks=[DailyCount(day=d, count=c) for d, c in daw],
    )
