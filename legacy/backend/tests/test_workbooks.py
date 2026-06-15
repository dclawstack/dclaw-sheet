import pytest


@pytest.mark.asyncio
async def test_list_workbooks_empty(client):
    response = await client.get("/api/v1/workbooks")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_create_and_get_workbook(client):
    payload = {"name": "Q1 Forecast", "description": "FY26 plan"}
    response = await client.post("/api/v1/workbooks", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Q1 Forecast"
    assert created["description"] == "FY26 plan"
    wb_id = created["id"]

    get_response = await client.get(f"/api/v1/workbooks/{wb_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == wb_id


@pytest.mark.asyncio
async def test_update_workbook(client):
    create = await client.post("/api/v1/workbooks", json={"name": "Draft"})
    wb_id = create.json()["id"]
    patch = await client.patch(
        f"/api/v1/workbooks/{wb_id}",
        json={"name": "Final"},
    )
    assert patch.status_code == 200
    assert patch.json()["name"] == "Final"


@pytest.mark.asyncio
async def test_delete_workbook(client):
    create = await client.post("/api/v1/workbooks", json={"name": "Trash"})
    wb_id = create.json()["id"]
    delete = await client.delete(f"/api/v1/workbooks/{wb_id}")
    assert delete.status_code == 204
    missing = await client.get(f"/api/v1/workbooks/{wb_id}")
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_list_workbooks_pagination(client):
    for i in range(3):
        await client.post("/api/v1/workbooks", json={"name": f"WB {i}"})
    response = await client.get("/api/v1/workbooks?limit=2&offset=0")
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
