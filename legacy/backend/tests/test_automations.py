import pytest


async def _make_sheet(client) -> tuple[str, str]:
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    s = (await client.post(f"/api/v1/workbooks/{wb['id']}/sheets", json={"name": "S"})).json()
    return wb["id"], s["id"]


@pytest.mark.asyncio
async def test_create_list_delete_automation(client):
    wb_id, sid = await _make_sheet(client)
    create = await client.post(
        "/api/v1/automations",
        json={
            "name": "Test",
            "workbook_id": wb_id,
            "trigger_type": "manual",
            "actions": [
                {"action_type": "emit_event", "config": {"event_type": "demo.fired"}}
            ],
        },
    )
    assert create.status_code == 201
    aid = create.json()["id"]
    listing = await client.get("/api/v1/automations")
    assert any(a["id"] == aid for a in listing.json())
    delete = await client.delete(f"/api/v1/automations/{aid}")
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_run_automation_emits_event(client):
    wb_id, sid = await _make_sheet(client)
    create = await client.post(
        "/api/v1/automations",
        json={
            "name": "Emit",
            "workbook_id": wb_id,
            "actions": [
                {"action_type": "emit_event", "config": {"event_type": "demo.fired"}}
            ],
        },
    )
    aid = create.json()["id"]
    run = await client.post(f"/api/v1/automations/{aid}/run")
    assert run.status_code == 200
    body = run.json()
    assert body["all_ok"]
    events = (await client.get("/api/v1/events?event_type=demo.fired")).json()
    assert events["total"] >= 1


@pytest.mark.asyncio
async def test_run_automation_write_cell_persists_and_recalcs(client):
    wb_id, sid = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "10", "data_type": "number"},
                {"row": 1, "column": 0, "value": "=A1*2"},
            ]
        },
    )
    create = await client.post(
        "/api/v1/automations",
        json={
            "name": "Bump A1",
            "workbook_id": wb_id,
            "actions": [
                {
                    "action_type": "write_cell",
                    "config": {
                        "sheet_id": sid,
                        "row": 0,
                        "column": 0,
                        "value": "25",
                        "data_type": "number",
                    },
                }
            ],
        },
    )
    aid = create.json()["id"]
    await client.post(f"/api/v1/automations/{aid}/run")
    cells = (await client.get(f"/api/v1/sheets/{sid}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(0, 0)]["value"] == "25"
    assert by[(1, 0)]["value"] == "50"  # recalculated


@pytest.mark.asyncio
async def test_run_automation_append_row(client):
    wb_id, sid = await _make_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "header"},
                {"row": 1, "column": 0, "value": "first"},
            ]
        },
    )
    create = await client.post(
        "/api/v1/automations",
        json={
            "name": "Append",
            "workbook_id": wb_id,
            "actions": [
                {
                    "action_type": "append_row",
                    "config": {
                        "sheet_id": sid,
                        "values": [{"column": 0, "value": "appended"}],
                    },
                }
            ],
        },
    )
    aid = create.json()["id"]
    await client.post(f"/api/v1/automations/{aid}/run")
    cells = (await client.get(f"/api/v1/sheets/{sid}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    assert by[(2, 0)]["value"] == "appended"


@pytest.mark.asyncio
async def test_unknown_automation_returns_404(client):
    resp = await client.post(
        "/api/v1/automations/00000000-0000-0000-0000-000000000000/run"
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_run_fires_automation_fired_telemetry(client):
    wb_id, sid = await _make_sheet(client)
    create = await client.post(
        "/api/v1/automations",
        json={
            "name": "Tele",
            "workbook_id": wb_id,
            "actions": [
                {"action_type": "emit_event", "config": {"event_type": "demo.fired"}}
            ],
        },
    )
    aid = create.json()["id"]
    await client.post(f"/api/v1/automations/{aid}/run")
    events = (await client.get("/api/v1/events?event_type=automation.fired")).json()
    assert events["total"] >= 1
