from collections import Counter, defaultdict
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils import utc_now
from app.models import Event
from app.repositories.base_repo import BaseRepository


class EventRepository(BaseRepository[Event]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Event)

    async def list_recent(
        self,
        *,
        workspace_id: UUID,
        limit: int = 100,
        event_type: str | None = None,
        workbook_id: UUID | None = None,
    ) -> tuple[list[Event], int]:
        stmt = (
            select(Event)
            .where(Event.workspace_id == workspace_id)
            .order_by(Event.created_at.desc())
            .limit(limit)
        )
        count_stmt = (
            select(func.count()).select_from(Event).where(Event.workspace_id == workspace_id)
        )
        if event_type:
            stmt = stmt.where(Event.event_type == event_type)
            count_stmt = count_stmt.where(Event.event_type == event_type)
        if workbook_id:
            stmt = stmt.where(Event.workbook_id == workbook_id)
            count_stmt = count_stmt.where(Event.workbook_id == workbook_id)
        result = await self.db.execute(stmt)
        items = list(result.scalars().all())
        total = (await self.db.execute(count_stmt)).scalar() or 0
        return items, total

    async def total(self, *, workspace_id: UUID) -> int:
        return (
            await self.db.execute(
                select(func.count())
                .select_from(Event)
                .where(Event.workspace_id == workspace_id)
            )
        ).scalar() or 0

    async def count_since(self, since: datetime, *, workspace_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(Event)
            .where(Event.workspace_id == workspace_id, Event.created_at >= since)
        )
        return result.scalar() or 0

    async def _events_since(self, since: datetime, *, workspace_id: UUID) -> list[Event]:
        result = await self.db.execute(
            select(Event).where(
                Event.workspace_id == workspace_id, Event.created_at >= since
            )
        )
        return list(result.scalars().all())

    async def daily_counts(self, *, workspace_id: UUID, days: int = 7) -> list[tuple[str, int]]:
        since = utc_now() - timedelta(days=days)
        events = await self._events_since(since, workspace_id=workspace_id)
        counts: Counter[str] = Counter(e.created_at.date().isoformat() for e in events)
        for n in range(days + 1):
            day = (utc_now() - timedelta(days=days - n)).date().isoformat()
            counts.setdefault(day, 0)
        return sorted(counts.items())

    async def daily_active_workbooks(
        self, *, workspace_id: UUID, days: int = 7
    ) -> list[tuple[str, int]]:
        since = utc_now() - timedelta(days=days)
        events = await self._events_since(since, workspace_id=workspace_id)
        per_day: dict[str, set] = defaultdict(set)
        for e in events:
            if e.workbook_id is None:
                continue
            per_day[e.created_at.date().isoformat()].add(e.workbook_id)
        for n in range(days + 1):
            day = (utc_now() - timedelta(days=days - n)).date().isoformat()
            per_day.setdefault(day, set())
        return sorted((d, len(s)) for d, s in per_day.items())

    async def counts_by_type(
        self, *, workspace_id: UUID, days: int = 30
    ) -> list[tuple[str, int]]:
        since = utc_now() - timedelta(days=days)
        result = await self.db.execute(
            select(Event.event_type, func.count())
            .where(Event.workspace_id == workspace_id, Event.created_at >= since)
            .group_by(Event.event_type)
            .order_by(func.count().desc())
        )
        return [(str(t), int(c)) for t, c in result.all()]
