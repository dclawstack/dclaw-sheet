"""Fire-and-forget telemetry emission.

emit() never raises — telemetry failures must not cascade into user-facing
errors. It always opens and closes its own commit window so callers don't
have to worry about transaction state.
"""
from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event

log = logging.getLogger(__name__)


async def emit(
    db: AsyncSession,
    event_type: str,
    *,
    user_id: str | None = None,
    workbook_id: UUID | None = None,
    sheet_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    try:
        event = Event(
            event_type=event_type,
            user_id=user_id,
            workbook_id=workbook_id,
            sheet_id=sheet_id,
            payload=payload,
        )
        db.add(event)
        await db.commit()
    except Exception as exc:
        log.warning("telemetry emit failed (%s): %s", event_type, exc)
        try:
            await db.rollback()
        except Exception:
            pass
