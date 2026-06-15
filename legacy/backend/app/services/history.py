"""Cell-change recording + version-history queries + workbook branching.

The recorder is called from the cell repo every time a cell is mutated, so
the append-only log captures every CRUD operation regardless of which API
endpoint triggered it.

branch_workbook() replays the history of a source workbook up to a chosen
timestamp into a brand-new workbook, giving us "Git for spreadsheets".
"""
from __future__ import annotations

import contextvars
from datetime import datetime
from typing import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cell, CellChange, Sheet, Workbook
from app.repositories.sheet_repo import SheetRepository
from app.repositories.workbook_repo import WorkbookRepository


# Request-scoped actor context the cell repo can pull from (set by the auth
# dep). Using a ContextVar instead of a module-level dict keyed by id(db)
# avoids two problems: id() values are reused after a session is GC'd (so a
# pooled/reused DB session could inherit a previous user's actor_email and
# attribute changes to the wrong user), and the dict never got cleared (a
# slow memory leak). A ContextVar is naturally scoped to the current
# request/task, so it cannot leak across pooled sessions.
_ACTOR_EMAIL: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "history_actor_email", default=None
)


def set_actor(db: AsyncSession, email: str | None) -> None:
    _ACTOR_EMAIL.set(email)


def clear_actor(db: AsyncSession) -> None:
    _ACTOR_EMAIL.set(None)


def _actor(db: AsyncSession) -> str | None:
    return _ACTOR_EMAIL.get()


async def record_change(
    db: AsyncSession,
    sheet: Sheet,
    *,
    row: int,
    column: int,
    operation: str,
    before: Cell | None,
    after: Cell | None,
) -> None:
    """Log a single cell mutation. Best-effort: failures don't raise."""
    try:
        change = CellChange(
            sheet_id=sheet.id,
            workbook_id=sheet.workbook_id,
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
        db.add(change)
        # Don't commit here — the calling repo commits its own transaction;
        # the recorder rides along. If the caller doesn't commit, the row
        # won't persist either, which is the right behaviour (no orphan log
        # entries for failed mutations).
    except Exception:
        # never break the user-facing call path
        pass


async def list_changes(
    db: AsyncSession,
    workbook_id: UUID,
    *,
    limit: int = 200,
    sheet_id: UUID | None = None,
) -> list[CellChange]:
    stmt = (
        select(CellChange)
        .where(CellChange.workbook_id == workbook_id)
        .order_by(CellChange.created_at.desc())
        .limit(limit)
    )
    if sheet_id:
        stmt = stmt.where(CellChange.sheet_id == sheet_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def branch_workbook(
    db: AsyncSession,
    source_workbook_id: UUID,
    workspace_id: UUID,
    new_name: str,
    at: datetime | None = None,
) -> Workbook:
    """Create a new workbook whose cells reflect the source's state at `at`
    (or 'now' if None). The new workbook has its own sheets + cells, and
    its own change history will be built up going forward.

    Implementation: replay the source's change log up to `at`, applying each
    upsert/clear in order via dict semantics (last-write-wins per coord).
    """
    src = await WorkbookRepository(db).get_for_workspace(source_workbook_id, workspace_id)
    if src is None:
        raise ValueError("Source workbook not found in workspace")

    # Build the new workbook
    new_wb = Workbook(workspace_id=workspace_id, name=new_name, description=src.description)
    db.add(new_wb)
    await db.commit()
    await db.refresh(new_wb)

    # Replay changes per sheet
    source_sheets = await SheetRepository(db).list_by_workbook(source_workbook_id)
    sheet_id_map: dict[UUID, UUID] = {}
    for src_sheet in source_sheets:
        new_sheet = Sheet(
            workbook_id=new_wb.id,
            name=src_sheet.name,
            position=src_sheet.position,
            row_count=src_sheet.row_count,
            column_count=src_sheet.column_count,
        )
        db.add(new_sheet)
        await db.commit()
        await db.refresh(new_sheet)
        sheet_id_map[src_sheet.id] = new_sheet.id

    # Walk the source's history forward up to `at`, building per-coord state
    stmt = (
        select(CellChange)
        .where(CellChange.workbook_id == source_workbook_id)
        .order_by(CellChange.created_at)
    )
    if at is not None:
        stmt = stmt.where(CellChange.created_at <= at)
    changes = list((await db.execute(stmt)).scalars().all())

    # If there's no history (e.g. created before history was tracked), fall
    # back to copying the live cells.
    if not changes:
        from app.repositories.cell_repo import CellRepository

        cell_repo = CellRepository(db)
        for src_sheet in source_sheets:
            src_cells = await cell_repo.list_by_sheet(src_sheet.id)
            new_sheet_id = sheet_id_map[src_sheet.id]
            for c in src_cells:
                db.add(
                    Cell(
                        sheet_id=new_sheet_id,
                        row=c.row,
                        column=c.column,
                        value=c.value,
                        formula=c.formula,
                        data_type=c.data_type,
                    )
                )
        await db.commit()
        return new_wb

    # Per (sheet_id, row, col): keep the last change so the resulting cell
    # reflects the cumulative state up to `at`.
    state: dict[tuple[UUID, int, int], CellChange] = {}
    for ch in changes:
        state[(ch.sheet_id, ch.row, ch.column)] = ch

    for (src_sheet_id, row, col), last in state.items():
        if last.operation == "clear":
            continue
        new_sheet_id = sheet_id_map.get(src_sheet_id)
        if new_sheet_id is None:
            continue
        db.add(
            Cell(
                sheet_id=new_sheet_id,
                row=row,
                column=col,
                value=last.value_after,
                formula=last.formula_after,
                data_type=last.data_type_after or "string",
            )
        )
    await db.commit()
    return new_wb
