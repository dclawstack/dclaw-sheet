from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class CellChangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sheet_id: UUID
    workbook_id: UUID
    row: int
    column: int
    operation: str
    value_before: str | None
    formula_before: str | None
    value_after: str | None
    formula_after: str | None
    data_type_after: str | None
    actor_email: str | None
    created_at: datetime


class BranchRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    at: datetime | None = None
