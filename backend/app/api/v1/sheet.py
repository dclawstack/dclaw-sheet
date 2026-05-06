import uuid
from datetime import datetime, timezone
from random import randint, uniform

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class CreateSpreadsheetRequest(BaseModel):
    name: str
    csv_data: str


class SpreadsheetResponse(BaseModel):
    id: str
    name: str
    row_count: int
    column_count: int
    summary: str
    status: str
    created_at: str


class StatsResponse(BaseModel):
    mean: float
    max: float
    min: float


@router.post("/spreadsheets")
async def create_spreadsheet(req: CreateSpreadsheetRequest):
    return SpreadsheetResponse(
        id=str(uuid.uuid4()),
        name=req.name,
        row_count=randint(10, 1000),
        column_count=randint(3, 20),
        summary="Mock summary",
        status="analyzed",
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/spreadsheets/{id}/stats")
async def get_spreadsheet_stats(id: str):
    return StatsResponse(
        mean=round(uniform(0, 100), 2),
        max=round(uniform(100, 300), 2),
        min=round(uniform(0, 50), 2),
    )
