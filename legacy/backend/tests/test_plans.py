import pytest


async def _seed_sheet(client) -> tuple[str, str]:
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    s = (await client.post(f"/api/v1/workbooks/{wb['id']}/sheets", json={"name": "S"})).json()
    return wb["id"], s["id"]


@pytest.mark.asyncio
async def test_create_and_run_plan_executes_steps(client):
    wb_id, sid = await _seed_sheet(client)
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "10", "data_type": "number"},
                {"row": 1, "column": 0, "value": "20", "data_type": "number"},
            ]
        },
    )
    create = await client.post(
        "/api/v1/plans",
        json={
            "goal": "Compute total and chart it",
            "workbook_id": wb_id,
            "sheet_id": sid,
            "steps": [
                {
                    "tool": "write_formula",
                    "args": {
                        "sheet_id": sid,
                        "row": 2,
                        "column": 0,
                        "formula": "=SUM(A1:A2)",
                    },
                },
                {
                    "tool": "make_chart",
                    "args": {"sheet_id": sid, "start": "A1", "end": "A3"},
                },
            ],
        },
    )
    assert create.status_code == 201
    pid = create.json()["id"]

    run = await client.post(f"/api/v1/plans/{pid}/run")
    body = run.json()
    assert body["status"] == "completed"
    assert all(s["status"] == "succeeded" for s in body["steps"])
    # Step 1: SUM should equal 30
    sum_step = next(s for s in body["steps"] if s["tool"] == "write_formula")
    assert sum_step["result"]["value"] == "30"
    # Step 2: chart result has vega_lite
    chart_step = next(s for s in body["steps"] if s["tool"] == "make_chart")
    assert "vega_lite" in chart_step["result"]


@pytest.mark.asyncio
async def test_unknown_tool_fails_plan(client):
    wb_id, sid = await _seed_sheet(client)
    create = await client.post(
        "/api/v1/plans",
        json={
            "goal": "fail",
            "workbook_id": wb_id,
            "steps": [{"tool": "bogus_tool", "args": {}}],
        },
    )
    pid = create.json()["id"]
    run = await client.post(f"/api/v1/plans/{pid}/run")
    body = run.json()
    assert body["status"] == "failed"
    assert body["steps"][0]["status"] == "failed"
    assert "Unknown tool" in body["steps"][0]["error"]


@pytest.mark.asyncio
async def test_failed_step_blocks_subsequent_steps(client):
    wb_id, sid = await _seed_sheet(client)
    create = await client.post(
        "/api/v1/plans",
        json={
            "goal": "two steps, first fails",
            "workbook_id": wb_id,
            "steps": [
                {"tool": "bogus", "args": {}},
                {"tool": "noop", "args": {}},
            ],
        },
    )
    pid = create.json()["id"]
    run = await client.post(f"/api/v1/plans/{pid}/run")
    body = run.json()
    assert body["status"] == "failed"
    # Second step never ran (status still "pending")
    assert body["steps"][1]["status"] == "pending"


@pytest.mark.asyncio
async def test_list_plans_workspace_scoped(client):
    wb_id, sid = await _seed_sheet(client)
    await client.post(
        "/api/v1/plans",
        json={"goal": "x", "workbook_id": wb_id, "steps": []},
    )
    listing = await client.get("/api/v1/plans")
    assert len(listing.json()) >= 1


@pytest.mark.asyncio
async def test_unknown_plan_returns_404(client):
    response = await client.post("/api/v1/plans/00000000-0000-0000-0000-000000000000/run")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_plan_run_emits_event(client):
    wb_id, sid = await _seed_sheet(client)
    create = await client.post(
        "/api/v1/plans",
        json={"goal": "trivial", "workbook_id": wb_id, "steps": [{"tool": "noop"}]},
    )
    pid = create.json()["id"]
    await client.post(f"/api/v1/plans/{pid}/run")
    events = (await client.get("/api/v1/events?event_type=plan.executed")).json()
    assert events["total"] >= 1
