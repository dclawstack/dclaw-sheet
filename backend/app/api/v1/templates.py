from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.database import get_db
from app.models import Sheet
from app.repositories.cell_repo import CellRepository
from app.repositories.sheet_repo import SheetRepository
from app.repositories.workbook_repo import WorkbookRepository
from app.schemas.sheet import SheetRead
from app.schemas.template import TemplateApplyRequest, TemplateRead
from app.services.formula.recalc import recalc_sheet
from app.services.schemas_cell_upsert import to_cell_upsert
from app.services.templates import get_template, list_templates
from app.services.telemetry import emit

router = APIRouter()


@router.get("", response_model=list[TemplateRead])
async def list_all():
    return [
        TemplateRead(
            id=t.id,
            name=t.name,
            category=t.category,
            description=t.description,
            sheet_names=[s.name for s in t.sheets],
        )
        for t in list_templates()
    ]


@router.post("/apply/{workbook_id}", response_model=list[SheetRead], status_code=201)
async def apply_template(
    workbook_id: UUID,
    payload: TemplateApplyRequest,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    workbook = await WorkbookRepository(db).get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    template = get_template(payload.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    sheet_repo = SheetRepository(db)
    cell_repo = CellRepository(db)
    existing_sheets = await sheet_repo.list_by_workbook(workbook_id)
    base_position = len(existing_sheets)

    created: list[Sheet] = []
    for offset, tpl_sheet in enumerate(template.sheets):
        sheet = Sheet(
            workbook_id=workbook_id,
            name=tpl_sheet.name,
            position=base_position + offset,
            row_count=tpl_sheet.row_count,
            column_count=tpl_sheet.column_count,
        )
        sheet = await sheet_repo.create(sheet)
        if tpl_sheet.cells:
            await cell_repo.bulk_upsert(
                sheet.id,
                [to_cell_upsert(c) for c in tpl_sheet.cells],
            )
            await recalc_sheet(db, sheet.id)
        created.append(sheet)

    await emit(
        db,
        "template.applied",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=workbook_id,
        payload={"template_id": template.id, "sheets": len(created)},
    )
    return [SheetRead.model_validate(s) for s in created]
