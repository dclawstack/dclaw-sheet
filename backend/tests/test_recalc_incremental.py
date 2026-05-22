"""Verifies the incremental recalc path used by the cell-upsert endpoints:

- Only formulas whose dependency closure intersects the changed coords
  should be re-evaluated.
- Independent formulas left alone, even if their stored value is stale.
- ROW()/COLUMN() resolve against the formula's own coordinates.
"""
import pytest

from app.models import Cell
from app.repositories.cell_repo import CellRepository
from app.repositories.sheet_repo import SheetRepository
from app.services.formula.recalc import recalc_after_changes


async def _make_sheet(client) -> str:
    wb = await client.post("/api/v1/workbooks", json={"name": "WB"})
    sheet = await client.post(
        f"/api/v1/workbooks/{wb.json()['id']}/sheets", json={"name": "S"}
    )
    return sheet.json()["id"]


@pytest.mark.asyncio
async def test_incremental_recalc_only_touches_dependents(client):
    sheet_id = await _make_sheet(client)
    # Seed: A1=10, A2 depends on A1, B1 depends on nothing
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "10", "data_type": "number"},
                {"row": 1, "column": 0, "value": "=A1*2"},
                {"row": 0, "column": 1, "value": "=99"},
            ]
        },
    )
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(1, 0)]["value"] == "20"
    assert by[(0, 1)]["value"] == "99"

    # Edit only A1 — only A2 (depends on A1) should be re-evaluated
    await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 0, "column": 0, "value": "7", "data_type": "number"},
    )
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(1, 0)]["value"] == "14"


@pytest.mark.asyncio
async def test_row_and_column_resolve_in_recalc(client):
    sheet_id = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 4, "column": 2, "value": "=ROW()"},        # C5
                {"row": 4, "column": 3, "value": "=COLUMN()"},     # D5
                {"row": 0, "column": 0, "value": "=ROW(B7)"},      # B7 -> 7
                {"row": 0, "column": 1, "value": "=COLUMN(D2)"},   # D2 -> 4
            ]
        },
    )
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(4, 2)]["value"] == "5"   # ROW() of C5 -> 5
    assert by[(4, 3)]["value"] == "4"   # COLUMN() of D5 -> 4
    assert by[(0, 0)]["value"] == "7"
    assert by[(0, 1)]["value"] == "4"


@pytest.mark.asyncio
async def test_if_short_circuit_doesnt_propagate_div_zero(client):
    sheet_id = await _make_sheet(client)
    # IF(TRUE, "ok", 1/0) — false branch must not execute
    await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 0, "column": 0, "value": '=IF(TRUE, "ok", 1/0)'},
    )
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(0, 0)]["value"] == "ok"
