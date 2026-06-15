"""Fire-and-forget telemetry emission.

emit() never raises — telemetry failures must not cascade into user-facing
errors. It opens its OWN AsyncSession and commit window so it never touches
the caller's request-scoped transaction (no commit/rollback on a shared
session, which could persist or discard the caller's half-finished work).
"""
from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine
from app.models import Event

log = logging.getLogger(__name__)


async def emit(
    event_type: str,
    *,
    user_id: str | None = None,
    workspace_id: UUID | None = None,
    workbook_id: UUID | None = None,
    sheet_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            event = Event(
                event_type=event_type,
                user_id=user_id,
                workspace_id=workspace_id,
                workbook_id=workbook_id,
                sheet_id=sheet_id,
                payload=payload,
            )
            session.add(event)
            await session.commit()
    except Exception as exc:
        log.warning("telemetry emit failed (%s): %s", event_type, exc)
