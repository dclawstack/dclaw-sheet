import pytest


async def _seed(client) -> tuple[str, str]:
    wb = (await client.post("/api/v1/workbooks", json={"name": "Source"})).json()
    s = (await client.post(f"/api/v1/workbooks/{wb['id']}/sheets", json={"name": "S"})).json()
    return wb["id"], s["id"]


@pytest.mark.asyncio
async def test_cell_upsert_records_change(client):
    wb_id, sid = await _seed(client)
    await client.put(
        f"/api/v1/sheets/{sid}/cells",
        json={"row": 0, "column": 0, "value": "hello"},
    )
    changes = (await client.get(f"/api/v1/history/workbooks/{wb_id}/changes")).json()
    assert any(
        c["row"] == 0 and c["column"] == 0 and c["value_after"] == "hello"
        for c in changes
    )


@pytest.mark.asyncio
async def test_history_includes_before_and_after(client):
    wb_id, sid = await _seed(client)
    await client.put(
        f"/api/v1/sheets/{sid}/cells",
        json={"row": 0, "column": 0, "value": "first"},
    )
    await client.put(
        f"/api/v1/sheets/{sid}/cells",
        json={"row": 0, "column": 0, "value": "second"},
    )
    changes = (await client.get(f"/api/v1/history/workbooks/{wb_id}/changes")).json()
    # Most recent first
    by_after = {c["value_after"]: c for c in changes}
    assert by_after["second"]["value_before"] == "first"


@pytest.mark.asyncio
async def test_history_records_actor_email(client):
    wb_id, sid = await _seed(client)
    await client.put(
        f"/api/v1/sheets/{sid}/cells",
        json={"row": 1, "column": 0, "value": "x"},
    )
    changes = (await client.get(f"/api/v1/history/workbooks/{wb_id}/changes")).json()
    assert any(c["actor_email"] == "dev@dclawstack.local" for c in changes)


@pytest.mark.asyncio
async def test_clear_sheet_logs_clear_operations(client):
    wb_id, sid = await _seed(client)
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "a"},
                {"row": 0, "column": 1, "value": "b"},
            ]
        },
    )
    await client.delete(f"/api/v1/sheets/{sid}/cells")
    changes = (await client.get(f"/api/v1/history/workbooks/{wb_id}/changes")).json()
    clears = [c for c in changes if c["operation"] == "clear"]
    assert len(clears) >= 2


@pytest.mark.asyncio
async def test_branch_workbook_copies_current_state(client):
    wb_id, sid = await _seed(client)
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "10", "data_type": "number"},
                {"row": 0, "column": 1, "value": "20", "data_type": "number"},
                {"row": 1, "column": 0, "value": "=A1+B1"},
            ]
        },
    )
    branch_resp = await client.post(
        f"/api/v1/history/workbooks/{wb_id}/branch",
        json={"name": "Branch of source"},
    )
    assert branch_resp.status_code == 201
    new_wb = branch_resp.json()
    assert new_wb["id"] != wb_id

    new_sheets = (await client.get(f"/api/v1/workbooks/{new_wb['id']}/sheets")).json()
    assert len(new_sheets) == 1
    new_sid = new_sheets[0]["id"]
    cells = (await client.get(f"/api/v1/sheets/{new_sid}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(0, 0)]["value"] == "10"
    assert by[(0, 1)]["value"] == "20"
    assert by[(1, 0)]["formula"] == "=A1+B1"


@pytest.mark.asyncio
async def test_branch_unknown_workbook_returns_404(client):
    response = await client.post(
        "/api/v1/history/workbooks/00000000-0000-0000-0000-000000000000/branch",
        json={"name": "x"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_branch_workbook_emits_event(client):
    wb_id, sid = await _seed(client)
    await client.put(
        f"/api/v1/sheets/{sid}/cells",
        json={"row": 0, "column": 0, "value": "v"},
    )
    await client.post(
        f"/api/v1/history/workbooks/{wb_id}/branch", json={"name": "branched"}
    )
    events = (
        await client.get("/api/v1/events?event_type=workbook.branched")
    ).json()
    assert events["total"] >= 1
