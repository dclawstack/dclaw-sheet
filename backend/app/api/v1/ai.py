import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.sheet_repo import SheetRepository
from app.schemas.ai import CopilotRequest, CopilotResponseBody
from app.services.ai_copilot import answer
from app.services.telemetry import emit

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
    await emit(
        db,
        "copilot.asked",
        workbook_id=sheet.workbook_id,
        sheet_id=sheet.id,
        payload={
            "provider": resp.provider,
            "prompt_chars": len(payload.prompt),
            "tool_calls": len(resp.tool_calls),
        },
    )
    return CopilotResponseBody(
        provider=resp.provider,
        message=resp.message,
        tool_calls=resp.tool_calls,
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/sheets/{sheet_id}/copilot/stream")
async def copilot_stream(
    sheet_id: UUID,
    payload: CopilotRequest,
    db: AsyncSession = Depends(get_db),
):
    """SSE variant: emits `message`, then one `tool_call` event per call, then `done`.

    The model still produces a single envelope under the hood — the streaming
    is at the *delivery* layer so the UI can render the message immediately
    and the tool-call cards as they arrive.
    """
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    resp = await answer(db, sheet_id, payload.prompt)
    await emit(
        db,
        "copilot.asked",
        workbook_id=sheet.workbook_id,
        sheet_id=sheet.id,
        payload={
            "provider": resp.provider,
            "stream": True,
            "tool_calls": len(resp.tool_calls),
        },
    )

    async def generator():
        yield _sse("message", {"provider": resp.provider, "message": resp.message})
        for call in resp.tool_calls:
            yield _sse("tool_call", call)
        yield _sse("done", {"count": len(resp.tool_calls)})

    return StreamingResponse(generator(), media_type="text/event-stream")
