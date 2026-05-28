from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.database import get_db
from app.repositories.sheet_repo import SheetRepository
from app.repositories.workbook_repo import WorkbookRepository
from app.services.yjs_relay import relay

router = APIRouter()


@router.get("/status")
async def collab_status():
    """Light HTTP endpoint useful for the frontend to verify the relay is up."""
    return relay.snapshot()


@router.get("/sheets/{sheet_id}/peers")
async def peers(
    sheet_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    workbook = await WorkbookRepository(db).get_for_workspace(
        sheet.workbook_id, scope.workspace.id
    )
    if workbook is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    room = await relay.get(str(sheet_id))
    return {"sheet_id": str(sheet_id), "clients": room.size}


@router.websocket("/ws/sheets/{sheet_id}")
async def collab_ws(websocket: WebSocket, sheet_id: UUID):
    """Yjs-compatible WebSocket relay endpoint.

    The frontend connects with `new WebsocketProvider("ws://.../api/v1/collab/ws/sheets/<id>", "sheet", doc)`.
    Auth: TODO add token-in-query verification — for the dev demo we skip it,
    same as the rest of the API in AUTH_PROVIDER=dev mode.
    """
    await websocket.accept()
    room = await relay.get(str(sheet_id))
    await room.join(websocket)
    try:
        while True:
            data = await websocket.receive_bytes()
            await room.broadcast(data, websocket)
    except WebSocketDisconnect:
        pass
    finally:
        await room.leave(websocket)
        await relay.prune(str(sheet_id))
