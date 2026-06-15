import pytest


async def _make_sheet(client) -> str:
    wb = await client.post("/api/v1/workbooks", json={"name": "WB"})
    wb_id = wb.json()["id"]
    sheet = await client.post(
        f"/api/v1/workbooks/{wb_id}/sheets",
        json={"name": "S"},
    )
    return sheet.json()["id"]


@pytest.mark.asyncio
async def test_upsert_single_cell(client):
    sheet_id = await _make_sheet(client)
    response = await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 0, "column": 0, "value": "42", "data_type": "number"},
    )
    assert response.status_code == 200
    cell = response.json()
    assert cell["row"] == 0
    assert cell["column"] == 0
    assert cell["value"] == "42"
    assert cell["data_type"] == "number"


@pytest.mark.asyncio
async def test_upsert_overwrites_existing_cell(client):
    sheet_id = await _make_sheet(client)
    await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 1, "column": 1, "value": "first"},
    )
    second = await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"row": 1, "column": 1, "value": "second"},
    )
    assert second.json()["value"] == "second"

    listing = await client.get(f"/api/v1/sheets/{sheet_id}/cells")
    cells = listing.json()
    assert len(cells) == 1
    assert cells[0]["value"] == "second"


@pytest.mark.asyncio
async def test_bulk_upsert_cells(client):
    sheet_id = await _make_sheet(client)
    payload = {
        "cells": [
            {"row": 0, "column": 0, "value": "A1"},
            {"row": 0, "column": 1, "value": "B1"},
            {"row": 1, "column": 0, "value": "A2"},
        ]
    }
    response = await client.patch(f"/api/v1/sheets/{sheet_id}/cells", json=payload)
    assert response.status_code == 200
    assert len(response.json()) == 3

    listing = await client.get(f"/api/v1/sheets/{sheet_id}/cells")
    assert len(listing.json()) == 3


@pytest.mark.asyncio
async def test_clear_cells(client):
    sheet_id = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"cells": [{"row": 0, "column": 0, "value": "x"}]},
    )
    clear = await client.delete(f"/api/v1/sheets/{sheet_id}/cells")
    assert clear.status_code == 204
    listing = await client.get(f"/api/v1/sheets/{sheet_id}/cells")
    assert listing.json() == []
