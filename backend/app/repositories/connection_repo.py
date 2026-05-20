from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Connection
from app.repositories.base_repo import BaseRepository


class ConnectionRepository(BaseRepository[Connection]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Connection)

    async def list_all_ordered(self) -> list[Connection]:
        result = await self.db.execute(
            select(Connection).order_by(Connection.created_at.desc())
        )
        return list(result.scalars().all())

    async def count_all(self) -> int:
        result = await self.db.execute(select(func.count()).select_from(Connection))
        return result.scalar() or 0
