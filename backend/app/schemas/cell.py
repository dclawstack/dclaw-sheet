from datetime import datetime
from uuid import UUID
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


DataType = Literal["string", "number", "boolean", "date", "formula"]


class CellUpsert(BaseModel):
    row: int = Field(ge=0)
    column: int = Field(ge=0)
    value: str | None = None
    formula: str | None = None
    data_type: DataType = "string"


class CellBulkUpsert(BaseModel):
    cells: list[CellUpsert]


class CellRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sheet_id: UUID
    row: int
    column: int
    value: str | None
    formula: str | None
    data_type: str
    updated_at: datetime
