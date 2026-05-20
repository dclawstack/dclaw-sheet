from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cell
from app.repositories.base_repo import BaseRepository
from app.schemas.cell import CellUpsert


class CellRepository(BaseRepository[Cell]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, Cell)

    async def list_by_sheet(self, sheet_id: UUID) -> list[Cell]:
        result = await self.db.execute(
            select(Cell).where(Cell.sheet_id == sheet_id).order_by(Cell.row, Cell.column)
        )
        return list(result.scalars().all())

    async def get_by_coord(self, sheet_id: UUID, row: int, column: int) -> Cell | None:
        result = await self.db.execute(
            select(Cell).where(
                Cell.sheet_id == sheet_id,
                Cell.row == row,
                Cell.column == column,
            )
        )
        return result.scalar_one_or_none()

    async def upsert(self, sheet_id: UUID, payload: CellUpsert) -> Cell:
        existing = await self.get_by_coord(sheet_id, payload.row, payload.column)
        if existing is not None:
            existing.value = payload.value
            existing.formula = payload.formula
            existing.data_type = payload.data_type
            await self.db.commit()
            await self.db.refresh(existing)
            return existing
        cell = Cell(
            sheet_id=sheet_id,
            row=payload.row,
            column=payload.column,
            value=payload.value,
            formula=payload.formula,
            data_type=payload.data_type,
        )
        self.db.add(cell)
        await self.db.commit()
        await self.db.refresh(cell)
        return cell

    async def bulk_upsert(self, sheet_id: UUID, payloads: list[CellUpsert]) -> list[Cell]:
        if not payloads:
            return []
        coord_to_payload = {(p.row, p.column): p for p in payloads}
        coords = list(coord_to_payload.keys())
        existing_result = await self.db.execute(
            select(Cell).where(
                Cell.sheet_id == sheet_id,
                Cell.row.in_({r for r, _ in coords}),
                Cell.column.in_({c for _, c in coords}),
            )
        )
        existing_by_coord = {(c.row, c.column): c for c in existing_result.scalars().all()}

        updated: list[Cell] = []
        for coord, payload in coord_to_payload.items():
            if coord in existing_by_coord:
                cell = existing_by_coord[coord]
                cell.value = payload.value
                cell.formula = payload.formula
                cell.data_type = payload.data_type
            else:
                cell = Cell(
                    sheet_id=sheet_id,
                    row=payload.row,
                    column=payload.column,
                    value=payload.value,
                    formula=payload.formula,
                    data_type=payload.data_type,
                )
                self.db.add(cell)
            updated.append(cell)

        await self.db.commit()
        for c in updated:
            await self.db.refresh(c)
        return updated

    async def clear_sheet(self, sheet_id: UUID) -> int:
        result = await self.db.execute(delete(Cell).where(Cell.sheet_id == sheet_id))
        await self.db.commit()
        return result.rowcount or 0
