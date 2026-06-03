from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import WorkspaceScope, get_current_workspace, require_writer
from app.core.database import get_db
from app.models import Plan
from app.schemas.plan import PlanCreate, PlanRead
from app.services.agentic import build_steps, run_plan
from app.services.telemetry import emit

router = APIRouter()


@router.get("", response_model=list[PlanRead])
async def list_plans(
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Plan)
        .where(Plan.workspace_id == scope.workspace.id)
        .order_by(Plan.created_at.desc())
    )
    return [PlanRead.model_validate(p) for p in result.scalars().all()]


@router.post("", response_model=PlanRead, status_code=201)
async def create_plan(
    payload: PlanCreate,
    scope: WorkspaceScope = Depends(require_writer),
    db: AsyncSession = Depends(get_db),
):
    plan = Plan(
        workspace_id=scope.workspace.id,
        workbook_id=payload.workbook_id,
        sheet_id=payload.sheet_id,
        goal=payload.goal,
        actor_email=scope.user.email,
        status="pending",
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    plan.steps.extend(build_steps(plan.id, [s.model_dump() for s in payload.steps]))
    await db.commit()
    await db.refresh(plan)
    return PlanRead.model_validate(plan)


@router.post("/{plan_id}/run", response_model=PlanRead)
async def run_endpoint(
    plan_id: UUID,
    scope: WorkspaceScope = Depends(require_writer),
    db: AsyncSession = Depends(get_db),
):
    plan = (
        await db.execute(
            select(Plan).where(
                Plan.id == plan_id, Plan.workspace_id == scope.workspace.id
            )
        )
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    plan = await run_plan(db, plan)
    await emit(
        "plan.executed",
        workspace_id=scope.workspace.id,
        user_id=scope.user.email,
        workbook_id=plan.workbook_id,
        sheet_id=plan.sheet_id,
        payload={
            "plan_id": str(plan.id),
            "status": plan.status,
            "steps": len(plan.steps),
        },
    )
    return PlanRead.model_validate(plan)


@router.get("/{plan_id}", response_model=PlanRead)
async def get_plan(
    plan_id: UUID,
    scope: WorkspaceScope = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    plan = (
        await db.execute(
            select(Plan).where(
                Plan.id == plan_id, Plan.workspace_id == scope.workspace.id
            )
        )
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return PlanRead.model_validate(plan)
