"""Demo seed / reset for the landing page.

Everything written here is scoped so reset can delete *only* demo rows:
  • the demo user is keyed by `settings.demo_user_email`
  • every workbook is named with the `DEMO_PREFIX` ("DEMO ")
Reset deletes those workbooks (cascading sheets + cells) and the demo user;
it never touches real data even if the flag is flipped on a populated DB.

To remove the demo feature entirely, delete these three things:
  1. backend/app/services/demo.py   (this file)
  2. backend/app/api/v1/demo.py     (the router)
  3. the demo router include in     backend/app/api/main.py
  (and optionally the demo_* settings in app/core/config.py)
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Cell, Org, Sheet, User, Workbook, Workspace
from app.services.formula.recalc import recalc_sheet

DEMO_PREFIX = "DEMO "


@dataclass
class DemoCredentials:
    email: str
    name: str
    note: str


@dataclass
class DemoStatus:
    enabled: bool
    seeded: bool
    workspace_id: str | None
    counts: dict[str, int]
    credentials: DemoCredentials | None = None


async def _default_workspace(db: AsyncSession) -> Workspace:
    """Resolve (or create) the workspace the demo workbook lives in.

    Mirrors core.auth so the demo data shows up for the default dev user.
    """
    org = (await db.execute(select(Org).where(Org.slug == "default"))).scalar_one_or_none()
    if org is None:
        org = Org(name="Default Org", slug="default")
        db.add(org)
        await db.flush()
    ws = (
        await db.execute(select(Workspace).where(Workspace.org_id == org.id))
    ).scalars().first()
    if ws is None:
        ws = Workspace(org_id=org.id, name="Default Workspace")
        db.add(ws)
        await db.flush()
    return ws


def _demo_credentials() -> DemoCredentials:
    return DemoCredentials(
        email=settings.demo_user_email,
        name=settings.demo_user_name,
        note=(
            "Auth uses the dev provider (or a Logto JWT) — no password. "
            "In dev mode just click Open App."
        ),
    )


async def gather_status(db: AsyncSession, *, enabled: bool) -> DemoStatus:
    ws = await _default_workspace(db)
    wb_ids = (
        await db.execute(
            select(Workbook.id).where(
                Workbook.workspace_id == ws.id,
                Workbook.name.like(f"{DEMO_PREFIX}%"),
            )
        )
    ).scalars().all()
    if not wb_ids:
        return DemoStatus(enabled=enabled, seeded=False, workspace_id=str(ws.id), counts={})

    sheet_ids = (
        await db.execute(select(Sheet.id).where(Sheet.workbook_id.in_(wb_ids)))
    ).scalars().all()
    cell_count = 0
    if sheet_ids:
        cell_count = len(
            (await db.execute(select(Cell.id).where(Cell.sheet_id.in_(sheet_ids)))).all()
        )
    user = (
        await db.execute(
            select(User).where(User.email == settings.demo_user_email.lower())
        )
    ).scalar_one_or_none()

    counts = {
        "users": 1 if user is not None else 0,
        "workbooks": len(wb_ids),
        "sheets": len(sheet_ids),
        "cells": cell_count,
    }
    return DemoStatus(
        enabled=enabled,
        seeded=True,
        workspace_id=str(ws.id),
        counts=counts,
        credentials=_demo_credentials(),
    )


def _cells_from_grid(sheet_id, grid: list[list]) -> list[Cell]:
    """Turn a 2D python grid into Cell rows (row/col are 0-based).

    Numbers become data_type="number", a leading "=" becomes a formula.
    """
    cells: list[Cell] = []
    for r, row in enumerate(grid):
        for c, raw in enumerate(row):
            if raw is None or raw == "":
                continue
            if isinstance(raw, str) and raw.startswith("="):
                cells.append(
                    Cell(sheet_id=sheet_id, row=r, column=c,
                         formula=raw, value=None, data_type="formula")
                )
            elif isinstance(raw, (int, float)):
                cells.append(
                    Cell(sheet_id=sheet_id, row=r, column=c,
                         value=str(raw), data_type="number")
                )
            else:
                cells.append(
                    Cell(sheet_id=sheet_id, row=r, column=c,
                         value=str(raw), data_type="string")
                )
    return cells


async def seed_demo(db: AsyncSession) -> DemoStatus:
    """Idempotent: wipe any existing demo data, then reseed."""
    await reset_demo(db)
    ws = await _default_workspace(db)

    # ── Demo user (informational; auth is dev/Logto, no password) ────────
    existing = (
        await db.execute(
            select(User).where(User.email == settings.demo_user_email.lower())
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            User(
                email=settings.demo_user_email.lower(),
                name=settings.demo_user_name,
                default_workspace_id=ws.id,
            )
        )

    # ── Workbook + two sheets of data ────────────────────────────────────
    workbook = Workbook(
        workspace_id=ws.id,
        name=f"{DEMO_PREFIX}Q1 Revenue Model",
        description="Sample workbook seeded by the demo — try charts, pivots, SQL and forecasts.",
    )
    db.add(workbook)
    await db.flush()

    # Sheet 1: monthly revenue with a totals formula (so the engine has work).
    revenue = Sheet(workbook_id=workbook.id, name="Revenue", position=0,
                    row_count=100, column_count=26)
    db.add(revenue)
    await db.flush()
    revenue_grid = [
        ["Month", "Revenue", "Cost", "Profit"],
        ["Jan", 12000, 7000, "=B2-C2"],
        ["Feb", 13500, 7200, "=B3-C3"],
        ["Mar", 15800, 7600, "=B4-C4"],
        ["Apr", 14200, 7400, "=B5-C5"],
        ["May", 17600, 8100, "=B6-C6"],
        ["Jun", 19300, 8500, "=B7-C7"],
        ["Jul", 21000, 8800, "=B8-C8"],
        ["Aug", 20400, 8700, "=B9-C9"],
        ["Sep", 22800, 9100, "=B10-C10"],
        ["Oct", 24500, 9400, "=B11-C11"],
        ["Nov", 26100, 9800, "=B12-C12"],
        ["Dec", 28900, 10200, "=B13-C13"],
        ["Total", "=SUM(B2:B13)", "=SUM(C2:C13)", "=SUM(D2:D13)"],
    ]
    db.add_all(_cells_from_grid(revenue.id, revenue_grid))

    # Sheet 2: regional sales table (good for pivots / SQL group-by).
    sales = Sheet(workbook_id=workbook.id, name="Sales", position=1,
                  row_count=100, column_count=26)
    db.add(sales)
    await db.flush()
    sales_grid = [
        ["Region", "Product", "Quarter", "Units", "Amount"],
        ["North", "Widget", "Q1", 120, 4800],
        ["North", "Gadget", "Q1", 80, 5600],
        ["South", "Widget", "Q1", 95, 3800],
        ["South", "Gadget", "Q1", 60, 4200],
        ["East", "Widget", "Q1", 140, 5600],
        ["East", "Gadget", "Q1", 110, 7700],
        ["West", "Widget", "Q1", 70, 2800],
        ["West", "Gadget", "Q1", 50, 3500],
    ]
    db.add_all(_cells_from_grid(sales.id, sales_grid))
    await db.flush()

    # Evaluate the formula cells so the grid shows computed values.
    await recalc_sheet(db, revenue.id)
    await recalc_sheet(db, sales.id)

    await db.commit()
    return await gather_status(db, enabled=True)


async def reset_demo(db: AsyncSession) -> DemoStatus:
    """Delete only demo-scoped rows (DEMO-prefixed workbooks + demo user)."""
    ws = await _default_workspace(db)
    wb_ids = (
        await db.execute(
            select(Workbook.id).where(
                Workbook.workspace_id == ws.id,
                Workbook.name.like(f"{DEMO_PREFIX}%"),
            )
        )
    ).scalars().all()
    if wb_ids:
        sheet_ids = (
            await db.execute(select(Sheet.id).where(Sheet.workbook_id.in_(wb_ids)))
        ).scalars().all()
        if sheet_ids:
            await db.execute(delete(Cell).where(Cell.sheet_id.in_(sheet_ids)))
            await db.execute(delete(Sheet).where(Sheet.id.in_(sheet_ids)))
        await db.execute(delete(Workbook).where(Workbook.id.in_(wb_ids)))
    await db.execute(
        delete(User).where(User.email == settings.demo_user_email.lower())
    )
    await db.commit()
    return await gather_status(db, enabled=True)
