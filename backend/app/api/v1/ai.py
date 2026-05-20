from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.sheet_repo import SheetRepository
from app.schemas.ai import CopilotRequest, CopilotResponseBody
from app.services.ai_copilot import answer

router = APIRouter()


@router.post("/sheets/{sheet_id}/copilot", response_model=CopilotResponseBody)
async def copilot(
    sheet_id: UUID,
    payload: CopilotRequest,
    db: AsyncSession = Depends(get_db),
):
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    resp = await answer(db, sheet_id, payload.prompt)
    return CopilotResponseBody(
        provider=resp.provider,
        message=resp.message,
        tool_calls=resp.tool_calls,
    )
