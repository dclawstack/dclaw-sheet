from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.database import get_db
from app.repositories.cell_repo import CellRepository
from app.repositories.sheet_repo import SheetRepository
from app.repositories.workbook_repo import WorkbookRepository
from app.schemas.forecast import (
    AnomalyPointModel,
    AnomalyRequest,
    AnomalyResponse,
    ForecastPointModel,
    ForecastRequest,
    ForecastResponse,
)
from app.services.formula.engine import col_letters_to_index
from app.services.forecasting import detect_anomalies, forecast_series
from app.services.telemetry import emit

router = APIRouter()


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


async def _column_values(
    db: AsyncSession,
    sheet_id: UUID,
    column_letter: str,
    skip_header: bool,
) -> tuple[int, str | None, list]:
    try:
        col_idx = col_letters_to_index(column_letter.upper())
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid column letter: {column_letter}")
    if col_idx < 0:
        raise HTTPException(status_code=400, detail=f"Invalid column letter: {column_letter}")

    cells = await CellRepository(db).list_by_sheet(sheet_id)
    by_row: dict[int, str | None] = {}
    for c in cells:
        if c.column == col_idx:
            by_row[c.row] = c.value
    if not by_row:
        raise HTTPException(status_code=400, detail=f"Column {column_letter} has no data")

    rows_sorted = sorted(by_row.keys())
    header_name: str | None = None
    if skip_header and rows_sorted[0] == 0:
        header_name = by_row.get(0)
        rows_sorted = [r for r in rows_sorted if r != 0]
    values = [by_row[r] for r in rows_sorted]
    return col_idx, header_name, values


@router.post("/sheets/{sheet_id}/forecast", response_model=ForecastResponse)
async def forecast(
    sheet_id: UUID,
    payload: ForecastRequest,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    sheet = await _scoped_sheet(sheet_id, scope, db)
    _col_idx, column_name, values = await _column_values(
        db, sheet_id, payload.column, payload.skip_header
    )
    try:
        result = forecast_series(values, periods=payload.periods)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await emit(
        db,
        "forecast.requested",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=sheet.workbook_id,
        sheet_id=sheet.id,
        payload={
            "column": payload.column.upper(),
            "periods": payload.periods,
            "history_points": len(result.history),
            "aic": result.fit_aic,
        },
    )
    return ForecastResponse(
        column=payload.column.upper(),
        column_name=column_name,
        history=result.history,
        forecast=[ForecastPointModel(**p.__dict__) for p in result.forecast],
        order=result.order,
        fit_aic=result.fit_aic,
    )


@router.post("/sheets/{sheet_id}/anomalies", response_model=AnomalyResponse)
async def anomalies(
    sheet_id: UUID,
    payload: AnomalyRequest,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    sheet = await _scoped_sheet(sheet_id, scope, db)
    _col_idx, column_name, values = await _column_values(
        db, sheet_id, payload.column, payload.skip_header
    )
    try:
        # detect_anomalies returns AnomalyPoint(index=position_in_provided_list)
        # Map that back to actual sheet rows.
        points = detect_anomalies(values, contamination=payload.contamination)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Map positional index back to sheet row number (account for header skip)
    row_offset = 1 if payload.skip_header else 0
    response_points = [
        AnomalyPointModel(
            row=p.index + row_offset,
            value=p.value,
            score=p.score,
            is_outlier=p.is_outlier,
        )
        for p in points
    ]
    outliers = sum(1 for p in response_points if p.is_outlier)
    await emit(
        db,
        "anomalies.requested",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=sheet.workbook_id,
        sheet_id=sheet.id,
        payload={"column": payload.column.upper(), "outliers": outliers},
    )
    return AnomalyResponse(
        column=payload.column.upper(),
        column_name=column_name,
        points=response_points,
        outlier_count=outliers,
    )
