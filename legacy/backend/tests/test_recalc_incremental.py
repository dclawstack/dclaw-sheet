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
async def test_new_formula_referencing_clean_formula_doesnt_get_circ(client):
    """Regression: editing a single dirty cell whose formula references a
    CLEAN formula cell (not in the dirty closure) used to be misclassified
    as a cycle because the topo sort filtered deps against the full formula
    set instead of the dirty subset. The clean dep is already in the seed
    grid; it must be treated as a leaf during topo-sort, not as unresolved.
    """
    sheet_id = await _make_sheet(client)
    # Seed the chain via bulk so the full graph is built once
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "5", "data_type": "number"},
                {"row": 1, "column": 0, "value": "=A1*2"},
            ]
        },
    )
    # Confirm A2 computed correctly
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(1, 0)]["value"] == "10"

    # Now add A3 that references the CLEAN formula A2. Only A3 is dirty.
    await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 2, "column": 0, "value": "=A2+1"},
    )
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(2, 0)]["value"] == "11", by[(2, 0)]
    assert by[(2, 0)]["value"] != "#CIRC!"


@pytest.mark.asyncio
async def test_multiple_sequential_formula_inserts(client):
    """Replicates the user-reported flow: insert several independent formulas
    one at a time, each referencing previously-stored numeric data. None
    should report #CIRC!.
    """
    sheet_id = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "1", "data_type": "number"},
                {"row": 1, "column": 0, "value": "3", "data_type": "number"},
                {"row": 2, "column": 0, "value": "5", "data_type": "number"},
                {"row": 3, "column": 1, "value": "2", "data_type": "number"},
                {"row": 4, "column": 1, "value": "34", "data_type": "number"},
                {"row": 5, "column": 1, "value": "23", "data_type": "number"},
            ]
        },
    )
    # Now insert formulas one at a time — each is its own dirty-set of size 1
    for row, formula, expected in [
        (6, "=SUM(A1:A3)", "9"),
        (7, "=AVERAGE(B4:B6)", "19.6666666667"),
        (8, "=A1+A2+A3", "9"),
        (9, "=MAX(A1:A3)+MIN(B4:B6)", "7"),
    ]:
        await client.put(
            f"/api/v1/sheets/{sheet_id}/cells",
            json={"row": row, "column": 0, "value": formula},
        )

    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(6, 0)]["value"] == "9"
    assert float(by[(7, 0)]["value"]) == pytest.approx(19.666666, abs=1e-3)
    assert by[(8, 0)]["value"] == "9"
    assert by[(9, 0)]["value"] == "7"
    # Crucial: no cell should be #CIRC!
    for r in range(6, 10):
        assert not by[(r, 0)]["value"].startswith("#CIRC"), by[(r, 0)]


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
