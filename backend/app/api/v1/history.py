from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.database import get_db
from app.repositories.workbook_repo import WorkbookRepository
from app.schemas.history import BranchRequest, CellChangeRead
from app.schemas.workbook import WorkbookRead
from app.services.history import branch_workbook, list_changes
from app.services.telemetry import emit

router = APIRouter()


@router.get(
    "/workbooks/{workbook_id}/changes",
    response_model=list[CellChangeRead],
)
async def list_workbook_changes(
    workbook_id: UUID,
    sheet_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    workbook = await WorkbookRepository(db).get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    changes = await list_changes(db, workbook_id, sheet_id=sheet_id, limit=limit)
    return [CellChangeRead.model_validate(c) for c in changes]


@router.post(
    "/workbooks/{workbook_id}/branch",
    response_model=WorkbookRead,
    status_code=201,
)
async def branch(
    workbook_id: UUID,
    payload: BranchRequest,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    try:
        new_wb = await branch_workbook(
            db,
            workbook_id,
            scope.workspace.id,
            new_name=payload.name,
            at=payload.at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    await emit(
        "workbook.branched",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=new_wb.id,
        payload={
            "source_workbook_id": str(workbook_id),
            "name": new_wb.name,
            "at": payload.at.isoformat() if payload.at else None,
        },
    )
    return WorkbookRead.model_validate(new_wb)
