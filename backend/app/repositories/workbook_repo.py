from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Workbook
from app.repositories.base_repo import BaseRepository


class WorkbookRepository(BaseRepository[Workbook]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Workbook)

    async def list_paginated(self, limit: int = 50, offset: int = 0) -> tuple[list[Workbook], int]:
        result = await self.db.execute(
            select(Workbook).order_by(Workbook.created_at.desc()).limit(limit).offset(offset)
        )
        items = list(result.scalars().all())
        total = (await self.db.execute(select(func.count()).select_from(Workbook))).scalar() or 0
        return items, total

    async def update(self, workbook: Workbook, **fields) -> Workbook:
        for key, value in fields.items():
            if value is not None:
                setattr(workbook, key, value)
        await self.db.commit()
        await self.db.refresh(workbook)
        return workbook
