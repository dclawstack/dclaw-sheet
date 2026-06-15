import pytest


async def _create_workbook(client) -> str:
    response = await client.post("/api/v1/workbooks", json={"name": "WB"})
    return response.json()["id"]


@pytest.mark.asyncio
async def test_create_sheet(client):
    wb_id = await _create_workbook(client)
    response = await client.post(
        f"/api/v1/workbooks/{wb_id}/sheets",
        json={"name": "Sheet1", "position": 0},
    )
    assert response.status_code == 201
    sheet = response.json()
    assert sheet["name"] == "Sheet1"
    assert sheet["workbook_id"] == wb_id
    assert sheet["row_count"] == 100
    assert sheet["column_count"] == 26


@pytest.mark.asyncio
async def test_list_sheets_under_workbook(client):
    wb_id = await _create_workbook(client)
    for i in range(2):
        await client.post(
            f"/api/v1/workbooks/{wb_id}/sheets",
            json={"name": f"Sheet{i}", "position": i},
        )
    response = await client.get(f"/api/v1/workbooks/{wb_id}/sheets")
    assert response.status_code == 200
    sheets = response.json()
    assert len(sheets) == 2
    assert [s["position"] for s in sheets] == [0, 1]


@pytest.mark.asyncio
async def test_sheet_under_missing_workbook_404(client):
    response = await client.post(
        "/api/v1/workbooks/00000000-0000-0000-0000-000000000000/sheets",
        json={"name": "X"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_and_delete_sheet(client):
    wb_id = await _create_workbook(client)
    create = await client.post(
        f"/api/v1/workbooks/{wb_id}/sheets",
        json={"name": "Original"},
    )
    sheet_id = create.json()["id"]

    patch = await client.patch(
        f"/api/v1/sheets/{sheet_id}",
        json={"name": "Renamed"},
    )
    assert patch.status_code == 200
    assert patch.json()["name"] == "Renamed"

    delete = await client.delete(f"/api/v1/sheets/{sheet_id}")
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_delete_workbook_cascades_sheets(client):
    wb_id = await _create_workbook(client)
    await client.post(f"/api/v1/workbooks/{wb_id}/sheets", json={"name": "S"})
    await client.delete(f"/api/v1/workbooks/{wb_id}")
    sheets_resp = await client.get(f"/api/v1/workbooks/{wb_id}/sheets")
    assert sheets_resp.status_code == 404
