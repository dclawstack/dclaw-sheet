import pytest


async def _seed_sheet(client) -> str:
    wb = await client.post("/api/v1/workbooks", json={"name": "WB"})
    s = await client.post(
        f"/api/v1/workbooks/{wb.json()['id']}/sheets",
        json={"name": "S"},
    )
    sheet_id = s.json()["id"]
    await client.patch(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "name"},
                {"row": 0, "column": 1, "value": "revenue"},
                {"row": 1, "column": 0, "value": "alice"},
                {"row": 1, "column": 1, "value": "100", "data_type": "number"},
                {"row": 2, "column": 0, "value": "bob"},
                {"row": 2, "column": 1, "value": "200", "data_type": "number"},
            ]
        },
    )
    return sheet_id


@pytest.mark.asyncio
async def test_copilot_sum_emits_write_formula(client):
    sheet_id = await _seed_sheet(client)
    response = await client.post(
        f"/api/v1/ai/sheets/{sheet_id}/copilot",
        json={"prompt": "sum the revenue column"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "stub"
    assert len(body["tool_calls"]) == 1
    tool = body["tool_calls"][0]
    assert tool["tool"] == "write_formula"
    assert tool["formula"].startswith("=SUM(")


@pytest.mark.asyncio
async def test_copilot_chart_emits_make_chart(client):
    sheet_id = await _seed_sheet(client)
    response = await client.post(
        f"/api/v1/ai/sheets/{sheet_id}/copilot",
        json={"prompt": "chart revenue by name"},
    )
    body = response.json()
    assert len(body["tool_calls"]) == 1
    assert body["tool_calls"][0]["tool"] == "make_chart"


@pytest.mark.asyncio
async def test_copilot_unknown_prompt_returns_empty_tool_calls(client):
    sheet_id = await _seed_sheet(client)
    response = await client.post(
        f"/api/v1/ai/sheets/{sheet_id}/copilot",
        json={"prompt": "tell me a story"},
    )
    body = response.json()
    assert body["tool_calls"] == []
    assert "Try" in body["message"]


@pytest.mark.asyncio
async def test_copilot_unknown_sheet_404(client):
    response = await client.post(
        "/api/v1/ai/sheets/00000000-0000-0000-0000-000000000000/copilot",
        json={"prompt": "sum"},
    )
    assert response.status_code == 404
