import pytest


async def _seed(client) -> str:
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    s = (await client.post(f"/api/v1/workbooks/{wb['id']}/sheets", json={"name": "S"})).json()
    sid = s["id"]
    await client.patch(
        f"/api/v1/sheets/{sid}/cells",
        json={
            "cells": [
                {"row": 0, "column": 0, "value": "customer_name"},
                {"row": 0, "column": 1, "value": "monthly_revenue"},
                {"row": 0, "column": 2, "value": "subscription_status"},
                {"row": 1, "column": 0, "value": "Acme"},
                {"row": 1, "column": 1, "value": "12000", "data_type": "number"},
                {"row": 1, "column": 2, "value": "active"},
                {"row": 2, "column": 0, "value": "Globex"},
                {"row": 2, "column": 1, "value": "18000", "data_type": "number"},
                {"row": 2, "column": 2, "value": "trial"},
            ]
        },
    )
    return sid


@pytest.mark.asyncio
async def test_dictionary_lists_headers_and_samples(client):
    sid = await _seed(client)
    body = (await client.get(f"/api/v1/rag/sheets/{sid}/dictionary")).json()
    headers = {e["header"] for e in body}
    assert {"customer_name", "monthly_revenue", "subscription_status"} <= headers


@pytest.mark.asyncio
async def test_query_ranks_revenue_column_for_revenue_question(client):
    sid = await _seed(client)
    resp = await client.post(
        f"/api/v1/rag/sheets/{sid}/query",
        json={"query": "what is the total revenue", "top_k": 3},
    )
    matches = resp.json()
    assert len(matches) >= 1
    assert matches[0]["entry"]["header"] == "monthly_revenue"


@pytest.mark.asyncio
async def test_query_ranks_status_column_for_status_question(client):
    sid = await _seed(client)
    resp = await client.post(
        f"/api/v1/rag/sheets/{sid}/query",
        json={"query": "show subscriptions in trial"},
    )
    matches = resp.json()
    headers = [m["entry"]["header"] for m in matches]
    assert "subscription_status" in headers


@pytest.mark.asyncio
async def test_query_unknown_sheet_404(client):
    response = await client.post(
        "/api/v1/rag/sheets/00000000-0000-0000-0000-000000000000/query",
        json={"query": "anything"},
    )
    assert response.status_code == 404
