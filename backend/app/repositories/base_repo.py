from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import TypeVar, Generic

from app.models.base import Base

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """Generic async CRUD repository.

    Subclass per entity:
        class UserRepository(BaseRepository[User]):
            def __init__(self, db: AsyncSession):
                super().__init__(db, User)
    """

    def __init__(self, db: AsyncSession, model: type[T]):
        self.db = db
        self.model = model

    async def list_all(self, limit: int = 20, offset: int = 0) -> tuple[list[T], int]:
        result = await self.db.execute(
            select(self.model).limit(limit).offset(offset)
        )
        items = list(result.scalars().all())
        count_result = await self.db.execute(select(func.count()).select_from(self.model))
        total = count_result.scalar() or 0
        return items, total

    async def get_by_id(self, item_id: UUID) -> T | None:
        result = await self.db.execute(
            select(self.model).where(self.model.id == item_id)
        )
        return result.scalar_one_or_none()

    async def create(self, obj: T) -> T:
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: T) -> None:
        await self.db.delete(obj)
        await self.db.commit()

    async def count(self) -> int:
        result = await self.db.execute(select(func.count()).select_from(self.model))
        return result.scalar() or 0
