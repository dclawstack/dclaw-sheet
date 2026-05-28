"""In-process agentic workflow runner.

A Plan is a list of PlanSteps. Each step calls one of the registered
tools (write_formula, write_cell, make_chart, run_sql, propose_clean, …)
and persists its result. The runner walks steps in order, retries
transient failures up to MAX_ATTEMPTS, and stops on hard failure with
the failing step marked "failed".

Temporal / Celery integration is the v2.1.1 path — for now this is a
single-process async loop that lives inside the API request lifecycle.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils import utc_now
from app.models import Plan, PlanStep
from app.repositories.cell_repo import CellRepository
from app.schemas.cell import CellUpsert
from app.services.charts import recommend_chart_for_range
from app.services.formula.recalc import recalc_after_changes


MAX_ATTEMPTS = 2


async def _tool_write_cell(db: AsyncSession, args: dict) -> dict:
    sheet_id = UUID(args["sheet_id"])
    payload = CellUpsert(
        row=int(args["row"]),
        column=int(args["column"]),
        value=args.get("value"),
        formula=args.get("formula"),
        data_type=args.get("data_type", "string"),
    )
    cell = await CellRepository(db).upsert(sheet_id, payload)
    await recalc_after_changes(db, sheet_id, [(cell.row, cell.column)])
    return {"row": cell.row, "column": cell.column, "value": cell.value}


async def _tool_write_formula(db: AsyncSession, args: dict) -> dict:
    args = {**args, "formula": args["formula"], "data_type": "formula"}
    return await _tool_write_cell(db, args)


async def _tool_make_chart(db: AsyncSession, args: dict) -> dict:
    spec = await recommend_chart_for_range(
        db,
        UUID(args["sheet_id"]),
        args["start"],
        args["end"],
        has_header=bool(args.get("has_header", True)),
    )
    return {"vega_lite": spec}


async def _tool_noop(db: AsyncSession, args: dict) -> dict:
    return {"noop": True, **args}


_TOOLS = {
    "write_cell": _tool_write_cell,
    "write_formula": _tool_write_formula,
    "make_chart": _tool_make_chart,
    "noop": _tool_noop,
}


async def _execute_step(db: AsyncSession, step: PlanStep) -> None:
    fn = _TOOLS.get(step.tool)
    if fn is None:
        step.status = "failed"
        step.error = f"Unknown tool: {step.tool}"
        return

    step.attempts = (step.attempts or 0) + 1
    step.started_at = utc_now()
    step.status = "running"
    try:
        result = await fn(db, step.args or {})
        step.result = result
        step.status = "succeeded"
    except Exception as exc:
        step.error = f"{type(exc).__name__}: {exc}"
        step.status = "failed"
    step.completed_at = utc_now()


async def run_plan(db: AsyncSession, plan: Plan) -> Plan:
    plan.status = "running"
    await db.commit()

    for step in plan.steps:
        for _attempt in range(MAX_ATTEMPTS):
            await _execute_step(db, step)
            await db.commit()
            if step.status == "succeeded":
                break
        if step.status == "failed":
            plan.status = "failed"
            await db.commit()
            return plan

    plan.status = "completed"
    await db.commit()
    return plan


def build_steps(plan_id: UUID, raw_steps: list[dict[str, Any]]) -> list[PlanStep]:
    steps: list[PlanStep] = []
    for i, raw in enumerate(raw_steps):
        steps.append(
            PlanStep(
                plan_id=plan_id,
                position=i,
                tool=raw.get("tool", "noop"),
                args=raw.get("args") or {},
                status="pending",
            )
        )
    return steps
