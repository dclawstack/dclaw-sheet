from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace, require_writer
from app.core.database import get_db
from app.models import Workbook
from app.repositories.workbook_repo import WorkbookRepository
from app.repositories.sheet_repo import SheetRepository
from app.schemas.sheet import SheetRead
from app.schemas.workbook import (
    WorkbookCreate,
    WorkbookList,
    WorkbookRead,
    WorkbookUpdate,
)
from app.services.csv_import import import_csv
from app.services.xlsx_io import import_xlsx
from app.services.formula.recalc import recalc_sheet
from app.services.telemetry import emit

router = APIRouter()


@router.get("", response_model=WorkbookList)
async def list_workbooks(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    repo = WorkbookRepository(db)
    items, total = await repo.list_paginated(
        workspace_id=scope.workspace.id, limit=limit, offset=offset
    )
    return WorkbookList(items=[WorkbookRead.model_validate(w) for w in items], total=total)


@router.post("", response_model=WorkbookRead, status_code=201)
async def create_workbook(
    payload: WorkbookCreate,
    scope: WorkspaceScope = Depends(require_writer),
    db: AsyncSession = Depends(get_db),
):
    repo = WorkbookRepository(db)
    workbook = Workbook(
        workspace_id=scope.workspace.id,
        name=payload.name,
        description=payload.description,
    )
    workbook = await repo.create(workbook)
    await emit(
        db,
        "workbook.created",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=workbook.id,
        payload={"name": workbook.name},
    )
    return WorkbookRead.model_validate(workbook)


@router.get("/{workbook_id}", response_model=WorkbookRead)
async def get_workbook(
    workbook_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    workbook = await WorkbookRepository(db).get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    return WorkbookRead.model_validate(workbook)


@router.patch("/{workbook_id}", response_model=WorkbookRead)
async def update_workbook(
    workbook_id: UUID,
    payload: WorkbookUpdate,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    repo = WorkbookRepository(db)
    workbook = await repo.get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    workbook = await repo.update(workbook, **payload.model_dump(exclude_unset=True))
    return WorkbookRead.model_validate(workbook)


@router.delete("/{workbook_id}", status_code=204)
async def delete_workbook(
    workbook_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    repo = WorkbookRepository(db)
    workbook = await repo.get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    name = workbook.name
    await repo.delete(workbook)
    await emit(
        db,
        "workbook.deleted",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        payload={"name": name},
    )


@router.get("/{workbook_id}/sheets", response_model=list[SheetRead])
async def list_sheets(
    workbook_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    workbook = await WorkbookRepository(db).get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    sheets = await SheetRepository(db).list_by_workbook(workbook_id)
    return [SheetRead.model_validate(s) for s in sheets]


@router.post("/{workbook_id}/import/csv", response_model=SheetRead, status_code=201)
async def import_csv_to_workbook(
    workbook_id: UUID,
    file: UploadFile = File(...),
    sheet_name: str = Form(default="Imported"),
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    workbook = await WorkbookRepository(db).get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    csv_bytes = await file.read()
    if not csv_bytes:
        raise HTTPException(status_code=400, detail="Empty CSV file")
    sheet = await import_csv(db, workbook_id, sheet_name, csv_bytes)
    await recalc_sheet(db, sheet.id)
    await emit(
        db,
        "csv.imported",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=workbook_id,
        sheet_id=sheet.id,
        payload={"sheet_name": sheet_name, "bytes": len(csv_bytes)},
    )
    return SheetRead.model_validate(sheet)


@router.post("/{workbook_id}/import/xlsx", response_model=list[SheetRead], status_code=201)
async def import_xlsx_to_workbook(
    workbook_id: UUID,
    file: UploadFile = File(...),
    sheet_name: str = Form(default=""),
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    workbook = await WorkbookRepository(db).get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    xlsx_bytes = await file.read()
    if not xlsx_bytes:
        raise HTTPException(status_code=400, detail="Empty XLSX file")
    try:
        sheets = await import_xlsx(db, workbook_id, sheet_name or None, xlsx_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse XLSX: {exc}")
    for s in sheets:
        await recalc_sheet(db, s.id)
    await emit(
        db,
        "xlsx.imported",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=workbook_id,
        payload={"sheets": len(sheets), "bytes": len(xlsx_bytes)},
    )
    return [SheetRead.model_validate(s) for s in sheets]
