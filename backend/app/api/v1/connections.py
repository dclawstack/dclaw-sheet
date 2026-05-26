from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.crypto import decrypt_json, encrypt_json
from app.core.database import get_db
from app.models import Connection
from app.repositories.connection_repo import ConnectionRepository
from app.repositories.sheet_repo import SheetRepository
from app.repositories.workbook_repo import WorkbookRepository
from app.schemas.connection import (
    ConnectionCreate,
    ConnectionRead,
    ConnectionReadWithConfig,
)
from app.schemas.sheet import SheetRead
from app.services.connectors import build_connector
from app.services.connector_sync import sync_into_sheet, sync_into_workbook
from app.services.telemetry import emit

router = APIRouter()


@router.get("", response_model=list[ConnectionRead])
async def list_connections(
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    items = await ConnectionRepository(db).list_for_workspace(scope.workspace.id)
    return [ConnectionRead.model_validate(i) for i in items]


@router.post("", response_model=ConnectionRead, status_code=201)
async def create_connection(
    payload: ConnectionCreate,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    try:
        build_connector(payload.type, payload.config)
    except KeyError as missing:
        raise HTTPException(status_code=400, detail=f"Missing required config field: {missing}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    conn = Connection(
        workspace_id=scope.workspace.id,
        name=payload.name,
        type=payload.type,
        config_encrypted=encrypt_json(payload.config),
    )
    conn = await ConnectionRepository(db).create(conn)
    await emit(
        db,
        "connection.created",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        payload={"type": conn.type, "name": conn.name},
    )
    return ConnectionRead.model_validate(conn)


@router.get("/{connection_id}", response_model=ConnectionReadWithConfig)
async def get_connection(
    connection_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    conn = await ConnectionRepository(db).get_for_workspace(connection_id, scope.workspace.id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    config = decrypt_json(conn.config_encrypted)
    connector = build_connector(conn.type, config)
    base = ConnectionRead.model_validate(conn).model_dump()
    return ConnectionReadWithConfig(**base, config=connector.redacted_config())


@router.delete("/{connection_id}", status_code=204)
async def delete_connection(
    connection_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    repo = ConnectionRepository(db)
    conn = await repo.get_for_workspace(connection_id, scope.workspace.id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    await repo.delete(conn)


@router.post("/{connection_id}/sync/{workbook_id}", status_code=201)
async def sync_into_workbook_endpoint(
    connection_id: UUID,
    workbook_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    conn = await ConnectionRepository(db).get_for_workspace(connection_id, scope.workspace.id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    workbook = await WorkbookRepository(db).get_for_workspace(workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    try:
        sheet, drift = await sync_into_workbook(db, conn, workbook_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Connector fetch failed: {exc}")
    await emit(
        db,
        "connection.synced",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=workbook_id,
        sheet_id=sheet.id,
        payload={"connection_type": conn.type, "drift": drift.to_dict()},
    )
    return {"sheet": SheetRead.model_validate(sheet).model_dump(mode="json"), "drift": drift.to_dict()}


@router.post("/refresh/sheets/{sheet_id}")
async def refresh_sheet(
    sheet_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    sheet = await SheetRepository(db).get_by_id(sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    workbook = await WorkbookRepository(db).get_for_workspace(sheet.workbook_id, scope.workspace.id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Sheet not found")
    if sheet.source_connection_id is None:
        raise HTTPException(status_code=400, detail="Sheet is not linked to a connection")
    conn = await ConnectionRepository(db).get_for_workspace(
        sheet.source_connection_id, scope.workspace.id
    )
    if conn is None:
        raise HTTPException(status_code=400, detail="Linked connection no longer exists")
    try:
        drift = await sync_into_sheet(db, conn, sheet)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Connector fetch failed: {exc}")
    await emit(
        db,
        "connection.refreshed",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=sheet.workbook_id,
        sheet_id=sheet.id,
        payload={"connection_type": conn.type, "drift": drift.to_dict()},
    )
    return {"sheet": SheetRead.model_validate(sheet).model_dump(mode="json"), "drift": drift.to_dict()}
