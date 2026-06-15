from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Connection
from app.repositories.base_repo import BaseRepository


class ConnectionRepository(BaseRepository[Connection]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Connection)

    async def list_for_workspace(self, workspace_id: UUID) -> list[Connection]:
        result = await self.db.execute(
            select(Connection)
            .where(Connection.workspace_id == workspace_id)
            .order_by(Connection.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_for_workspace(
        self, connection_id: UUID, workspace_id: UUID
    ) -> Connection | None:
        result = await self.db.execute(
            select(Connection).where(
                Connection.id == connection_id, Connection.workspace_id == workspace_id
            )
        )
        return result.scalar_one_or_none()

    async def count_all(self) -> int:
        result = await self.db.execute(select(func.count()).select_from(Connection))
        return result.scalar() or 0
