from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace, require_writer
from app.core.database import get_db
from app.models import Automation
from app.schemas.automation import (
    ActionOutcomeRead,
    AutomationCreate,
    AutomationRead,
    RunResponse,
)
from app.services.automation import run_automation

router = APIRouter()


@router.get("", response_model=list[AutomationRead])
async def list_automations(
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Automation)
        .where(Automation.workspace_id == scope.workspace.id)
        .order_by(Automation.created_at.desc())
    )
    return [AutomationRead.model_validate(a) for a in result.scalars().all()]


@router.post("", response_model=AutomationRead, status_code=201)
async def create_automation(
    payload: AutomationCreate,
    scope: WorkspaceScope = Depends(require_writer),
    db: AsyncSession = Depends(get_db),
):
    automation = Automation(
        workspace_id=scope.workspace.id,
        workbook_id=payload.workbook_id,
        name=payload.name,
        trigger_type=payload.trigger_type,
        trigger_config=payload.trigger_config,
        actions=payload.actions,
        enabled=True,
    )
    db.add(automation)
    await db.commit()
    await db.refresh(automation)
    return AutomationRead.model_validate(automation)


@router.delete("/{automation_id}", status_code=204)
async def delete_automation(
    automation_id: UUID,
    scope: WorkspaceScope = Depends(require_writer),
    db: AsyncSession = Depends(get_db),
):
    automation = (
        await db.execute(
            select(Automation).where(
                Automation.id == automation_id,
                Automation.workspace_id == scope.workspace.id,
            )
        )
    ).scalar_one_or_none()
    if automation is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    await db.delete(automation)
    await db.commit()


@router.post("/{automation_id}/run", response_model=RunResponse)
async def run_endpoint(
    automation_id: UUID,
    scope: WorkspaceScope = Depends(require_writer),
    db: AsyncSession = Depends(get_db),
):
    automation = (
        await db.execute(
            select(Automation).where(
                Automation.id == automation_id,
                Automation.workspace_id == scope.workspace.id,
            )
        )
    ).scalar_one_or_none()
    if automation is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    outcomes = await run_automation(db, automation, scope.workspace.id, scope.user.email)
    return RunResponse(
        automation_id=automation.id,
        outcomes=[ActionOutcomeRead(**o.__dict__) for o in outcomes],
        all_ok=all(o.ok for o in outcomes),
    )
