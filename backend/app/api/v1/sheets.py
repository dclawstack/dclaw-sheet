from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Sheet
from app.repositories.sheet_repo import SheetRepository
from app.repositories.workbook_repo import WorkbookRepository
from app.repositories.cell_repo import CellRepository
from app.schemas.sheet import SheetCreate, SheetRead, SheetUpdate
from app.schemas.cell import CellBulkUpsert, CellRead, CellUpsert
from app.services.formula.recalc import recalc_sheet
from app.services.charts import recommend_chart_for_range
from app.services.xlsx_io import export_sheet_xlsx

router = APIRouter()


@router.post("/workbooks/{workbook_id}/sheets", response_model=SheetRead, status_code=201)
async def create_sheet(
    workbook_id: UUID,
    payload: SheetCreate,
    db: AsyncSession = Depends(get_db),
):
    wb_repo = WorkbookRepository(db)
    workbook = await wb_repo.get_by_id(workbook_id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    repo = SheetRepository(db)
    sheet = Sheet(
        workbook_id=workbook_id,
        name=payload.name,
        position=payload.position,
        row_count=payload.row_count,
        column_count=payload.column_count,
    )
    sheet = await repo.create(sheet)
    return SheetRead.model_validate(sheet)


@router.get("/sheets/{sheet_id}", response_model=SheetRead)
async def get_sheet(sheet_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = SheetRepository(db)
    sheet = await repo.get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    return SheetRead.model_validate(sheet)


@router.patch("/sheets/{sheet_id}", response_model=SheetRead)
async def update_sheet(
    sheet_id: UUID,
    payload: SheetUpdate,
    db: AsyncSession = Depends(get_db),
):
    repo = SheetRepository(db)
    sheet = await repo.get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    sheet = await repo.update(sheet, **payload.model_dump(exclude_unset=True))
    return SheetRead.model_validate(sheet)


@router.delete("/sheets/{sheet_id}", status_code=204)
async def delete_sheet(sheet_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = SheetRepository(db)
    sheet = await repo.get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    await repo.delete(sheet)


@router.get("/sheets/{sheet_id}/cells", response_model=list[CellRead])
async def list_cells(sheet_id: UUID, db: AsyncSession = Depends(get_db)):
    sheet_repo = SheetRepository(db)
    sheet = await sheet_repo.get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    cells = await CellRepository(db).list_by_sheet(sheet_id)
    return [CellRead.model_validate(c) for c in cells]


@router.put("/sheets/{sheet_id}/cells", response_model=CellRead)
async def upsert_cell(
    sheet_id: UUID,
    payload: CellUpsert,
    db: AsyncSession = Depends(get_db),
):
    sheet_repo = SheetRepository(db)
    sheet = await sheet_repo.get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    cell = await CellRepository(db).upsert(sheet_id, payload)
    await recalc_sheet(db, sheet_id)
    await db.refresh(cell)
    return CellRead.model_validate(cell)


@router.patch("/sheets/{sheet_id}/cells", response_model=list[CellRead])
async def bulk_upsert_cells(
    sheet_id: UUID,
    payload: CellBulkUpsert,
    db: AsyncSession = Depends(get_db),
):
    sheet_repo = SheetRepository(db)
    sheet = await sheet_repo.get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    cells = await CellRepository(db).bulk_upsert(sheet_id, payload.cells)
    await recalc_sheet(db, sheet_id)
    for c in cells:
        await db.refresh(c)
    return [CellRead.model_validate(c) for c in cells]


@router.delete("/sheets/{sheet_id}/cells", status_code=204)
async def clear_cells(sheet_id: UUID, db: AsyncSession = Depends(get_db)):
    sheet_repo = SheetRepository(db)
    sheet = await sheet_repo.get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    await CellRepository(db).clear_sheet(sheet_id)


@router.get("/sheets/{sheet_id}/export.xlsx")
async def export_xlsx(sheet_id: UUID, db: AsyncSession = Depends(get_db)):
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    xlsx_bytes = await export_sheet_xlsx(db, sheet_id)
    safe_name = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in sheet.name) or "sheet"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'},
    )


@router.get("/sheets/{sheet_id}/chart")
async def chart_recommendation(
    sheet_id: UUID,
    start: str = Query(..., description='Top-left cell ref of range, e.g. "A1"'),
    end: str = Query(..., description='Bottom-right cell ref, e.g. "C20"'),
    has_header: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    try:
        spec = await recommend_chart_for_range(db, sheet_id, start, end, has_header=has_header)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid range: {exc}")
    return {"vega_lite": spec}
