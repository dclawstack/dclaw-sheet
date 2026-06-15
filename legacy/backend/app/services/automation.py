"""Automation runtime.

run_automation() executes a sequence of actions for a given Automation row.
v1 supports three action types — emit_event, write_cell, append_row — and
is fire-and-forget: actions run in sequence; if one fails the chain stops
and returns a summary the caller can surface in the UI.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils import utc_now
from app.models import Automation
from app.repositories.cell_repo import CellRepository
from app.repositories.sheet_repo import SheetRepository
from app.schemas.cell import CellUpsert
from app.services.formula.recalc import recalc_after_changes
from app.services.telemetry import emit


@dataclass
class ActionOutcome:
    action_type: str
    ok: bool
    detail: str | None = None


async def run_automation(
    db: AsyncSession,
    automation: Automation,
    workspace_id: UUID,
    actor_email: str | None,
) -> list[ActionOutcome]:
    outcomes: list[ActionOutcome] = []
    for action in automation.actions or []:
        action_type = action.get("action_type")
        config = action.get("config") or {}
        try:
            if action_type == "emit_event":
                await emit(
                    config.get("event_type", "automation.fired"),
                    workspace_id=workspace_id,
                    user_id=actor_email,
                    workbook_id=automation.workbook_id,
                    payload={"automation_id": str(automation.id), **(config.get("payload") or {})},
                )
                outcomes.append(ActionOutcome(action_type, True))

            elif action_type == "write_cell":
                sheet_id = UUID(config["sheet_id"])
                payload = CellUpsert(
                    row=int(config["row"]),
                    column=int(config["column"]),
                    value=config.get("value"),
                    formula=config.get("formula"),
                    data_type=config.get("data_type", "string"),
                )
                cell = await CellRepository(db).upsert(sheet_id, payload)
                await recalc_after_changes(db, sheet_id, [(cell.row, cell.column)])
                outcomes.append(
                    ActionOutcome(action_type, True, f"({cell.row},{cell.column})")
                )

            elif action_type == "append_row":
                sheet_id = UUID(config["sheet_id"])
                cells = await CellRepository(db).list_by_sheet(sheet_id)
                next_row = (max((c.row for c in cells), default=-1) + 1)
                values: list[dict[str, Any]] = config.get("values") or []
                payloads = [
                    CellUpsert(
                        row=next_row,
                        column=int(v["column"]),
                        value=v.get("value"),
                        formula=v.get("formula"),
                        data_type=v.get("data_type", "string"),
                    )
                    for v in values
                ]
                if payloads:
                    await CellRepository(db).bulk_upsert(sheet_id, payloads)
                    await recalc_after_changes(
                        db, sheet_id, [(p.row, p.column) for p in payloads]
                    )
                outcomes.append(ActionOutcome(action_type, True, f"row {next_row}"))

            else:
                outcomes.append(
                    ActionOutcome(action_type or "?", False, f"unknown action_type: {action_type}")
                )
                break
        except Exception as exc:
            outcomes.append(ActionOutcome(action_type or "?", False, str(exc)))
            break

    automation.last_fired_at = utc_now()
    await db.commit()
    await emit(
        "automation.fired",
        workspace_id=workspace_id,
        user_id=actor_email,
        workbook_id=automation.workbook_id,
        payload={
            "automation_id": str(automation.id),
            "name": automation.name,
            "actions": len(automation.actions or []),
            "all_ok": all(o.ok for o in outcomes),
        },
    )
    return outcomes
