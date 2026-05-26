from app.schemas.cell import CellUpsert
from app.services.templates import TemplateCell


def to_cell_upsert(tc: TemplateCell) -> CellUpsert:
    return CellUpsert(
        row=tc.row,
        column=tc.column,
        value=tc.value,
        formula=tc.formula,
        data_type=tc.data_type,  # type: ignore[arg-type]
    )
