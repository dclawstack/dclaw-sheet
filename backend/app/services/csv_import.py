import csv
import io
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Sheet
from app.repositories.cell_repo import CellRepository
from app.repositories.sheet_repo import SheetRepository
from app.schemas.cell import CellUpsert


def _infer_type(raw: str) -> tuple[str, str]:
    """Return (data_type, normalized_value) for a CSV cell value."""
    stripped = raw.strip()
    if stripped == "":
        return "string", ""
    lowered = stripped.lower()
    if lowered in ("true", "false"):
        return "boolean", lowered
    try:
        int(stripped)
        return "number", stripped
    except ValueError:
        pass
    try:
        float(stripped)
        return "number", stripped
    except ValueError:
        pass
    return "string", stripped


async def import_csv(
    db: AsyncSession,
    workbook_id: UUID,
    sheet_name: str,
    csv_bytes: bytes,
) -> Sheet:
    text = csv_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)

    row_count = max(len(rows), 100)
    column_count = max((len(r) for r in rows), default=0) or 26

    sheet_repo = SheetRepository(db)
    sheet = Sheet(
        workbook_id=workbook_id,
        name=sheet_name,
        position=0,
        row_count=max(row_count, 100),
        column_count=max(column_count, 26),
    )
    sheet = await sheet_repo.create(sheet)

    cell_payloads: list[CellUpsert] = []
    for r_idx, row in enumerate(rows):
        for c_idx, raw in enumerate(row):
            data_type, value = _infer_type(raw)
            cell_payloads.append(
                CellUpsert(row=r_idx, column=c_idx, value=value, data_type=data_type)
            )

    if cell_payloads:
        cell_repo = CellRepository(db)
        await cell_repo.bulk_upsert(sheet.id, cell_payloads)

    return sheet
