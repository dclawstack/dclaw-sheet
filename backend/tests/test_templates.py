import pytest


@pytest.mark.asyncio
async def test_list_returns_bundled_templates(client):
    resp = await client.get("/api/v1/templates")
    assert resp.status_code == 200
    items = resp.json()
    ids = {t["id"] for t in items}
    # Spot-check the bundled set
    assert {"runway", "saas_metrics", "cohort_retention", "sales_pipeline", "financial_model"} <= ids


@pytest.mark.asyncio
async def test_apply_template_creates_sheet_with_cells_and_formulas(client):
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    resp = await client.post(
        f"/api/v1/templates/apply/{wb['id']}",
        json={"template_id": "runway"},
    )
    assert resp.status_code == 201
    sheets = resp.json()
    assert len(sheets) == 1
    sid = sheets[0]["id"]
    cells = (await client.get(f"/api/v1/sheets/{sid}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    # The "Net burn" formula in row 4 col 1 is "=B3-B4"
    assert by[(4, 1)]["formula"] == "=B3-B4"
    # Recalc ran — value should be a number
    assert by[(4, 1)]["value"] not in (None, "", "#CIRC!")


@pytest.mark.asyncio
async def test_apply_unknown_template_returns_404(client):
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    resp = await client.post(
        f"/api/v1/templates/apply/{wb['id']}", json={"template_id": "nope"}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_apply_template_emits_event(client):
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    await client.post(
        f"/api/v1/templates/apply/{wb['id']}", json={"template_id": "saas_metrics"}
    )
    events = (
        await client.get("/api/v1/events?event_type=template.applied")
    ).json()
    assert events["total"] >= 1


@pytest.mark.asyncio
async def test_template_apply_to_foreign_workbook_404(client):
    resp = await client.post(
        "/api/v1/templates/apply/00000000-0000-0000-0000-000000000000",
        json={"template_id": "runway"},
    )
    assert resp.status_code == 404
