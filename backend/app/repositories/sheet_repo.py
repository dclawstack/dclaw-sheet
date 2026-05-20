from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Sheet
from app.repositories.base_repo import BaseRepository


class SheetRepository(BaseRepository[Sheet]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Sheet)

    async def list_by_workbook(self, workbook_id: UUID) -> list[Sheet]:
        result = await self.db.execute(
            select(Sheet).where(Sheet.workbook_id == workbook_id).order_by(Sheet.position)
        )
        return list(result.scalars().all())

    async def update(self, sheet: Sheet, **fields) -> Sheet:
        for key, value in fields.items():
            if value is not None:
                setattr(sheet, key, value)
        await self.db.commit()
        await self.db.refresh(sheet)
        return sheet
