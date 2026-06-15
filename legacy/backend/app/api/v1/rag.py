from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.database import get_db
from app.repositories.sheet_repo import SheetRepository
from app.repositories.workbook_repo import WorkbookRepository
from app.services.rag import build_sheet_dictionary, rank_by_query

router = APIRouter()


class DictionaryEntryRead(BaseModel):
    column_index: int
    column_letter: str
    header: str
    samples: list[str]


class MatchRead(BaseModel):
    entry: DictionaryEntryRead
    score: float


class RagQueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)


async def _scoped_sheet(sheet_id: UUID, scope: WorkspaceScope, db: AsyncSession):
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    workbook = await WorkbookRepository(db).get_for_workspace(
        sheet.workbook_id, scope.workspace.id
    )
    if workbook is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    return sheet


@router.get("/sheets/{sheet_id}/dictionary", response_model=list[DictionaryEntryRead])
async def dictionary(
    sheet_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    await _scoped_sheet(sheet_id, scope, db)
    entries = await build_sheet_dictionary(db, sheet_id)
    return [
        DictionaryEntryRead(
            column_index=e.column_index,
            column_letter=e.column_letter,
            header=e.header,
            samples=e.samples,
        )
        for e in entries
    ]


@router.post("/sheets/{sheet_id}/query", response_model=list[MatchRead])
async def query(
    sheet_id: UUID,
    payload: RagQueryRequest,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    await _scoped_sheet(sheet_id, scope, db)
    entries = await build_sheet_dictionary(db, sheet_id)
    matches = rank_by_query(entries, payload.query, top_k=payload.top_k)
    return [
        MatchRead(
            entry=DictionaryEntryRead(
                column_index=m.entry.column_index,
                column_letter=m.entry.column_letter,
                header=m.entry.header,
                samples=m.entry.samples,
            ),
            score=m.score,
        )
        for m in matches
    ]
