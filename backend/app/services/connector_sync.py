"""Orchestrates: fetch from connector → drift-check → replace sheet cells.

Sheet linkage: when sync_connection_into_workbook() creates a new sheet, the
sheet's source_connection_id points at the Connection. Refreshing an existing
linked sheet reuses sync_connection_into_sheet() to overwrite the data area.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_json
from app.core.utils import utc_now
from app.models import Connection, Sheet
from app.repositories.cell_repo import CellRepository
from app.repositories.connection_repo import ConnectionRepository
from app.repositories.sheet_repo import SheetRepository
from app.schemas.cell import CellUpsert
from app.services.connectors import build_connector, compute_drift
from app.services.connectors.drift import DriftReport
from app.services.formula.recalc import recalc_sheet


def _serialise(value: Any) -> tuple[str, str | None]:
    """Convert a connector cell value to (data_type, string-or-None)."""
    if value is None:
        return "string", None
    if isinstance(value, bool):
        return "boolean", "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return "number", str(int(value)) if float(value).is_integer() else str(value)
    if isinstance(value, datetime):
        return "date", value.isoformat()
    s = str(value)
    if s.startswith("="):
        # Don't promote connector strings to formulas — connectors emit data
        return "string", s
    return "string", s


async def _read_existing_headers(
    db: AsyncSession, sheet_id: UUID, column_count: int
) -> list[str]:
    cells = await CellRepository(db).list_by_sheet(sheet_id)
    headers: dict[int, str] = {}
    for c in cells:
        if c.row == 0 and c.value is not None:
            headers[c.column] = c.value
    return [headers.get(c, "") for c in range(column_count)]


async def sync_into_sheet(
    db: AsyncSession,
    connection: Connection,
    sheet: Sheet,
) -> DriftReport:
    """Fetch from the connector and replace the sheet's data area."""
    config = decrypt_json(connection.config_encrypted)
    connector = build_connector(connection.type, config)
    result = await connector.fetch()

    prev_headers = await _read_existing_headers(db, sheet.id, len(result.columns) or sheet.column_count)
    has_prev_data = any(h for h in prev_headers)
    drift = compute_drift(prev_headers if has_prev_data else None, result.columns)

    cell_repo = CellRepository(db)
    await cell_repo.clear_sheet(sheet.id)

    payloads: list[CellUpsert] = []
    for c_idx, header in enumerate(result.columns):
        payloads.append(CellUpsert(row=0, column=c_idx, value=str(header), data_type="string"))
    for r_idx, row in enumerate(result.rows):
        for c_idx, raw in enumerate(row):
            data_type, value = _serialise(raw)
            payloads.append(
                CellUpsert(row=r_idx + 1, column=c_idx, value=value, data_type=data_type)
            )

    if payloads:
        await cell_repo.bulk_upsert(sheet.id, payloads)

    # Resize the sheet to fit the new data
    sheet_repo = SheetRepository(db)
    new_rows = max(len(result.rows) + 1, 100)
    new_cols = max(len(result.columns), 26)
    sheet.source_connection_id = connection.id
    sheet.row_count = new_rows
    sheet.column_count = new_cols
    await db.commit()
    await db.refresh(sheet)

    connection.last_synced_at = utc_now()
    connection.last_row_count = result.row_count
    await db.commit()
    await db.refresh(connection)

    await recalc_sheet(db, sheet.id)
    return drift


async def sync_into_workbook(
    db: AsyncSession,
    connection: Connection,
    workbook_id: UUID,
    sheet_name: str | None = None,
) -> tuple[Sheet, DriftReport]:
    """Create a new sheet in the workbook and populate it from the connection."""
    sheet_repo = SheetRepository(db)
    existing_sheets = await sheet_repo.list_by_workbook(workbook_id)
    position = len(existing_sheets)
    sheet = Sheet(
        workbook_id=workbook_id,
        name=sheet_name or connection.name,
        position=position,
        row_count=100,
        column_count=26,
        source_connection_id=connection.id,
    )
    sheet = await sheet_repo.create(sheet)
    drift = await sync_into_sheet(db, connection, sheet)
    return sheet, drift
