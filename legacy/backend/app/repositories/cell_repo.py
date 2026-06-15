from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cell, CellChange, Sheet
from app.repositories.base_repo import BaseRepository
from app.schemas.cell import CellUpsert
from app.services.formula.engine import is_formula
from app.services.history import _actor


def _normalise(payload: CellUpsert) -> CellUpsert:
    """If the user typed a leading '=' in the value field, treat it as a formula."""
    if payload.formula is None and is_formula(payload.value):
        return payload.model_copy(update={"formula": payload.value, "value": None, "data_type": "formula"})
    return payload


async def _sheet_workbook_id(db: AsyncSession, sheet_id: UUID) -> UUID | None:
    result = await db.execute(select(Sheet.workbook_id).where(Sheet.id == sheet_id))
    return result.scalar_one_or_none()


def _record(
    db: AsyncSession,
    *,
    sheet_id: UUID,
    workbook_id: UUID,
    row: int,
    column: int,
    operation: str,
    before: Cell | None,
    after: Cell | None,
) -> None:
    try:
        db.add(
            CellChange(
                sheet_id=sheet_id,
                workbook_id=workbook_id,
                row=row,
                column=column,
                operation=operation,
                value_before=before.value if before else None,
                formula_before=before.formula if before else None,
                value_after=after.value if after else None,
                formula_after=after.formula if after else None,
                data_type_after=after.data_type if after else None,
                actor_email=_actor(db),
            )
        )
    except Exception:
        pass


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
        payload = _normalise(payload)
        wb_id = await _sheet_workbook_id(self.db, sheet_id)
        existing = await self.get_by_coord(sheet_id, payload.row, payload.column)
        # Snapshot existing values BEFORE mutation for the history log
        before_snapshot = (
            Cell(
                value=existing.value,
                formula=existing.formula,
                data_type=existing.data_type,
            )
            if existing
            else None
        )
        if existing is not None:
            existing.value = payload.value
            existing.formula = payload.formula
            existing.data_type = payload.data_type
            cell = existing
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
        if wb_id is not None:
            _record(
                self.db,
                sheet_id=sheet_id,
                workbook_id=wb_id,
                row=payload.row,
                column=payload.column,
                operation="upsert",
                before=before_snapshot,
                after=cell,
            )
        await self.db.commit()
        await self.db.refresh(cell)
        return cell

    async def bulk_upsert(self, sheet_id: UUID, payloads: list[CellUpsert]) -> list[Cell]:
        if not payloads:
            return []
        payloads = [_normalise(p) for p in payloads]
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
        wb_id = await _sheet_workbook_id(self.db, sheet_id)

        updated: list[Cell] = []
        for coord, payload in coord_to_payload.items():
            before_snapshot = None
            if coord in existing_by_coord:
                src = existing_by_coord[coord]
                before_snapshot = Cell(
                    value=src.value, formula=src.formula, data_type=src.data_type
                )
                src.value = payload.value
                src.formula = payload.formula
                src.data_type = payload.data_type
                cell = src
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
            if wb_id is not None:
                _record(
                    self.db,
                    sheet_id=sheet_id,
                    workbook_id=wb_id,
                    row=payload.row,
                    column=payload.column,
                    operation="upsert",
                    before=before_snapshot,
                    after=cell,
                )
            updated.append(cell)

        await self.db.commit()
        for c in updated:
            await self.db.refresh(c)
        return updated

    async def clear_sheet(self, sheet_id: UUID) -> int:
        wb_id = await _sheet_workbook_id(self.db, sheet_id)
        existing = await self.list_by_sheet(sheet_id)
        result = await self.db.execute(delete(Cell).where(Cell.sheet_id == sheet_id))
        if wb_id is not None:
            for c in existing:
                _record(
                    self.db,
                    sheet_id=sheet_id,
                    workbook_id=wb_id,
                    row=c.row,
                    column=c.column,
                    operation="clear",
                    before=Cell(value=c.value, formula=c.formula, data_type=c.data_type),
                    after=None,
                )
        await self.db.commit()
        return result.rowcount or 0
