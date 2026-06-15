import pytest


@pytest.mark.asyncio
async def test_workbook_create_emits_event(client):
    await client.post("/api/v1/workbooks", json={"name": "Telem WB"})
    events = (await client.get("/api/v1/events?event_type=workbook.created")).json()
    assert events["total"] == 1
    assert events["items"][0]["event_type"] == "workbook.created"
    assert events["items"][0]["payload"]["name"] == "Telem WB"


@pytest.mark.asyncio
async def test_sheet_create_emits_event(client):
    wb = await client.post("/api/v1/workbooks", json={"name": "WB"})
    wb_id = wb.json()["id"]
    await client.post(f"/api/v1/workbooks/{wb_id}/sheets", json={"name": "S"})
    events = (
        await client.get(f"/api/v1/events?event_type=sheet.created&workbook_id={wb_id}")
    ).json()
    assert events["total"] == 1
    assert events["items"][0]["payload"]["name"] == "S"


@pytest.mark.asyncio
async def test_copilot_call_emits_event(client):
    wb = await client.post("/api/v1/workbooks", json={"name": "WB"})
    s = await client.post(
        f"/api/v1/workbooks/{wb.json()['id']}/sheets", json={"name": "S"}
    )
    sid = s.json()["id"]
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "x"},
                {"row": 1, "column": 0, "value": "1", "data_type": "number"},
            ]
        },
    )
    await client.post(f"/api/v1/ai/sheets/{sid}/copilot", json={"prompt": "sum"})
    events = (await client.get("/api/v1/events?event_type=copilot.asked")).json()
    assert events["total"] == 1
    assert events["items"][0]["payload"]["provider"] == "stub"


@pytest.mark.asyncio
async def test_chart_request_emits_event(client):
    wb = await client.post("/api/v1/workbooks", json={"name": "WB"})
    s = await client.post(
        f"/api/v1/workbooks/{wb.json()['id']}/sheets", json={"name": "S"}
    )
    sid = s.json()["id"]
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "x"},
                {"row": 0, "column": 1, "value": "y"},
                {"row": 1, "column": 0, "value": "a"},
                {"row": 1, "column": 1, "value": "1", "data_type": "number"},
            ]
        },
    )
    await client.get(
        f"/api/v1/sheets/{sid}/chart", params={"start": "A1", "end": "B2"}
    )
    events = (await client.get("/api/v1/events?event_type=chart.requested")).json()
    assert events["total"] == 1
    assert events["items"][0]["payload"]["mark"] == "bar"


@pytest.mark.asyncio
async def test_summary_endpoint_returns_aggregates(client):
    for i in range(3):
        await client.post("/api/v1/workbooks", json={"name": f"WB {i}"})
    summary = (await client.get("/api/v1/events/summary?days=7")).json()
    assert summary["total_events"] >= 3
    assert summary["events_today"] >= 3
    # by_type should include workbook.created
    types = {b["event_type"] for b in summary["by_type"]}
    assert "workbook.created" in types
    # daily counts include today's bucket
    today_counts = [d for d in summary["daily_counts"] if d["count"] > 0]
    assert today_counts


@pytest.mark.asyncio
async def test_events_filter_by_workbook(client):
    wb_a = (await client.post("/api/v1/workbooks", json={"name": "A"})).json()
    wb_b = (await client.post("/api/v1/workbooks", json={"name": "B"})).json()
    await client.post(f"/api/v1/workbooks/{wb_a['id']}/sheets", json={"name": "S"})
    only_a = (
        await client.get(f"/api/v1/events?workbook_id={wb_a['id']}")
    ).json()
    only_b = (
        await client.get(f"/api/v1/events?workbook_id={wb_b['id']}")
    ).json()
    # Workbook A has its own create event + the sheet event
    assert only_a["total"] >= 2
    # Workbook B has only its create event
    a_event_ids = {e["id"] for e in only_a["items"]}
    b_event_ids = {e["id"] for e in only_b["items"]}
    assert a_event_ids.isdisjoint(b_event_ids)
