import io
import pytest


@pytest.mark.asyncio
async def test_csv_import_creates_sheet_and_cells(client):
    wb = await client.post("/api/v1/workbooks", json={"name": "Imported"})
    wb_id = wb.json()["id"]

    csv_content = b"name,age,active\nAlice,30,true\nBob,25,false\n"
    files = {"file": ("data.csv", io.BytesIO(csv_content), "text/csv")}
    data = {"sheet_name": "people"}
    response = await client.post(
        f"/api/v1/workbooks/{wb_id}/import/csv",
        files=files,
        data=data,
    )
    assert response.status_code == 201
    sheet = response.json()
    assert sheet["name"] == "people"
    sheet_id = sheet["id"]

    cells = (await client.get(f"/api/v1/sheets/{sheet_id}/cells")).json()
    by_coord = {(c["row"], c["column"]): c for c in cells}
    # header row
    assert by_coord[(0, 0)]["value"] == "name"
    assert by_coord[(0, 0)]["data_type"] == "string"
    # numeric inference
    assert by_coord[(1, 1)]["value"] == "30"
    assert by_coord[(1, 1)]["data_type"] == "number"
    # boolean inference
    assert by_coord[(1, 2)]["data_type"] == "boolean"


@pytest.mark.asyncio
async def test_csv_import_rejects_empty_file(client):
    wb = await client.post("/api/v1/workbooks", json={"name": "Imported"})
    wb_id = wb.json()["id"]
    files = {"file": ("empty.csv", io.BytesIO(b""), "text/csv")}
    response = await client.post(
        f"/api/v1/workbooks/{wb_id}/import/csv",
        files=files,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_csv_import_unknown_workbook_404(client):
    files = {"file": ("data.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")}
    response = await client.post(
        "/api/v1/workbooks/00000000-0000-0000-0000-000000000000/import/csv",
        files=files,
    )
    assert response.status_code == 404
