import math

import pytest


async def _seed_revenue_sheet(client) -> str:
    """Create a workbook + sheet with a 'revenue' column (header in B1, 24 months of growth)."""
    wb = await client.post("/api/v1/workbooks", json={"name": "Forecast WB"})
    s = await client.post(
        f"/api/v1/workbooks/{wb.json()['id']}/sheets", json={"name": "Revenue"}
    )
    sid = s.json()["id"]
    cells = [
        {"row": 0, "column": 0, "value": "month"},
        {"row": 0, "column": 1, "value": "revenue"},
    ]
    base = 1000.0
    for m in range(24):
        cells.append({"row": m + 1, "column": 0, "value": f"2025-{(m % 12) + 1:02d}"})
        # Linear growth + a clear outlier at month 15
        value = base + 50 * m + (300 if m == 15 else 0)
        cells.append(
            {"row": m + 1, "column": 1, "value": str(value), "data_type": "number"}
        )
    await client.patch(f"/api/v1/sheets/{sid}/cells", json={"cells": cells})
    return sid


@pytest.mark.asyncio
async def test_forecast_returns_projection_with_confidence_bands(client):
    sid = await _seed_revenue_sheet(client)
    response = await client.post(
        f"/api/v1/forecast/sheets/{sid}/forecast",
        json={"column": "B", "periods": 6, "skip_header": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["column"] == "B"
    assert body["column_name"] == "revenue"
    assert len(body["history"]) == 24
    assert len(body["forecast"]) == 6
    first = body["forecast"][0]
    # Mean projection should be in the same ballpark as the last history value
    last_history = body["history"][-1]
    assert abs(first["mean"] - last_history) / last_history < 0.5
    # Confidence bands must straddle the mean
    assert first["lower_95"] <= first["lower_80"] <= first["mean"] <= first["upper_80"] <= first["upper_95"]
    assert body["fit_aic"] == pytest.approx(body["fit_aic"])  # finite


@pytest.mark.asyncio
async def test_forecast_rejects_too_short_series(client):
    wb = await client.post("/api/v1/workbooks", json={"name": "Short"})
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
                {"row": 2, "column": 0, "value": "2", "data_type": "number"},
            ]
        },
    )
    response = await client.post(
        f"/api/v1/forecast/sheets/{sid}/forecast",
        json={"column": "A", "periods": 6, "skip_header": True},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_anomaly_flags_seeded_outlier(client):
    sid = await _seed_revenue_sheet(client)
    response = await client.post(
        f"/api/v1/forecast/sheets/{sid}/anomalies",
        json={"column": "B", "contamination": 0.1, "skip_header": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["outlier_count"] >= 1
    outlier_rows = [p["row"] for p in body["points"] if p["is_outlier"]]
    # We seeded a +300 spike at month 15 (row 16 with header)
    assert 16 in outlier_rows


@pytest.mark.asyncio
async def test_invalid_column_letter_returns_400(client):
    sid = await _seed_revenue_sheet(client)
    response = await client.post(
        f"/api/v1/forecast/sheets/{sid}/forecast",
        json={"column": "!!", "periods": 6},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_foreign_sheet_returns_404(client):
    response = await client.post(
        "/api/v1/forecast/sheets/00000000-0000-0000-0000-000000000000/forecast",
        json={"column": "A", "periods": 3},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_forecast_and_anomaly_emit_events(client):
    sid = await _seed_revenue_sheet(client)
    await client.post(
        f"/api/v1/forecast/sheets/{sid}/forecast",
        json={"column": "B", "periods": 3},
    )
    await client.post(
        f"/api/v1/forecast/sheets/{sid}/anomalies",
        json={"column": "B"},
    )
    events = (await client.get("/api/v1/events")).json()
    types = {e["event_type"] for e in events["items"]}
    assert "forecast.requested" in types
    assert "anomalies.requested" in types
