import pytest


async def _seed_sheet(client) -> str:
    wb = await client.post("/api/v1/workbooks", json={"name": "WB"})
    s = await client.post(
        f"/api/v1/workbooks/{wb.json()['id']}/sheets", json={"name": "S"}
    )
    sid = s.json()["id"]
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "name"},
                {"row": 0, "column": 1, "value": "n"},
                {"row": 1, "column": 0, "value": "a"},
                {"row": 1, "column": 1, "value": "1", "data_type": "number"},
                {"row": 2, "column": 0, "value": "b"},
                {"row": 2, "column": 1, "value": "2", "data_type": "number"},
            ]
        },
    )
    return sid


@pytest.mark.asyncio
async def test_copilot_stream_emits_message_then_tool_calls_then_done(client):
    sheet_id = await _seed_sheet(client)
    response = await client.post(
        f"/api/v1/ai/sheets/{sheet_id}/copilot/stream",
        json={"prompt": "sum the n column"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    # SSE events arrive as: "event: <name>\ndata: <json>\n\n"
    assert "event: message" in body
    assert "event: tool_call" in body
    assert "event: done" in body
    assert '"tool": "write_formula"' in body


@pytest.mark.asyncio
async def test_copilot_stream_unknown_sheet_404(client):
    response = await client.post(
        "/api/v1/ai/sheets/00000000-0000-0000-0000-000000000000/copilot/stream",
        json={"prompt": "sum"},
    )
    assert response.status_code == 404
