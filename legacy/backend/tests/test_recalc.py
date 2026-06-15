import pytest


async def _make_sheet(client) -> str:
    wb = await client.post("/api/v1/workbooks", json={"name": "WB"})
    sheet = await client.post(
        f"/api/v1/workbooks/{wb.json()['id']}/sheets",
        json={"name": "S"},
    )
    return sheet.json()["id"]


@pytest.mark.asyncio
async def test_formula_cell_computes_value(client):
    sheet_id = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "10", "data_type": "number"},
                {"row": 1, "column": 0, "value": "20", "data_type": "number"},
                {"row": 2, "column": 0, "value": "30", "data_type": "number"},
            ]
        },
    )
    response = await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 3, "column": 0, "value": "=SUM(A1:A3)"},
    )
    body = response.json()
    assert body["formula"] == "=SUM(A1:A3)"
    assert body["value"] == "60"
    assert body["data_type"] == "number"


@pytest.mark.asyncio
async def test_formula_recalcs_on_dependency_change(client):
    sheet_id = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "5", "data_type": "number"},
                {"row": 1, "column": 0, "value": "=A1*2"},
            ]
        },
    )
    # Update A1 → A2 (formula) should auto-recompute
    await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 0, "column": 0, "value": "7", "data_type": "number"},
    )
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by_coord = {(c["row"], c["column"]): c for c in cells}
    assert by_coord[(1, 0)]["value"] == "14"


@pytest.mark.asyncio
async def test_chained_formulas_topologically_evaluated(client):
    sheet_id = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "3", "data_type": "number"},
                {"row": 1, "column": 0, "value": "=A1+1"},
                {"row": 2, "column": 0, "value": "=A2*2"},
            ]
        },
    )
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(1, 0)]["value"] == "4"
    assert by[(2, 0)]["value"] == "8"


@pytest.mark.asyncio
async def test_div_zero_produces_error_string(client):
    sheet_id = await _make_sheet(client)
    response = await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 0, "column": 0, "value": "=1/0"},
    )
    assert response.json()["value"] == "#DIV/0!"


@pytest.mark.asyncio
async def test_cycle_marked_with_circ_error(client):
    sheet_id = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "=B1"},
                {"row": 0, "column": 1, "value": "=A1"},
            ]
        },
    )
    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    values = {(c["row"], c["column"]): c["value"] for c in cells}
    assert values[(0, 0)] == "#CIRC!"
    assert values[(0, 1)] == "#CIRC!"
