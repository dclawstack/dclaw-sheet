import pytest


async def _seed(client) -> str:
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
                {"row": 0, "column": 1, "value": "price"},
                {"row": 0, "column": 2, "value": "status"},
                {"row": 1, "column": 0, "value": "alice"},
                {"row": 1, "column": 1, "value": "10", "data_type": "number"},
                {"row": 1, "column": 2, "value": "paid"},
                {"row": 2, "column": 0, "value": "bob"},
                {"row": 2, "column": 1, "value": "20", "data_type": "number"},
                {"row": 2, "column": 2, "value": "invoiced"},
                {"row": 3, "column": 0, "value": "carol"},
                {"row": 3, "column": 1, "value": "9999", "data_type": "number"},
                {"row": 3, "column": 2, "value": "BOGUS"},
            ]
        },
    )
    return sid


@pytest.mark.asyncio
async def test_create_and_list_rules(client):
    sid = await _seed(client)
    resp = await client.post(
        f"/api/v1/validation/sheets/{sid}/rules",
        json={
            "column": 1,
            "rule_type": "range",
            "params": {"min": 0, "max": 1000},
        },
    )
    assert resp.status_code == 201
    listing = await client.get(f"/api/v1/validation/sheets/{sid}/rules")
    assert len(listing.json()) == 1


@pytest.mark.asyncio
async def test_run_validation_flags_range_violation(client):
    sid = await _seed(client)
    await client.post(
        f"/api/v1/validation/sheets/{sid}/rules",
        json={"column": 1, "rule_type": "range", "params": {"min": 0, "max": 100}},
    )
    run = await client.post(f"/api/v1/validation/sheets/{sid}/run")
    body = run.json()
    # 9999 at (row=3, col=1) violates
    assert any(i["row"] == 3 and i["column"] == 1 for i in body["issues"])


@pytest.mark.asyncio
async def test_lookup_rule_flags_bogus(client):
    sid = await _seed(client)
    await client.post(
        f"/api/v1/validation/sheets/{sid}/rules",
        json={
            "column": 2,
            "rule_type": "lookup",
            "params": {"values": ["paid", "invoiced", "refunded"]},
        },
    )
    run = await client.post(f"/api/v1/validation/sheets/{sid}/run")
    issues = run.json()["issues"]
    # 'BOGUS' at row 3 col 2 should fail; header row 0 col 2 (=='status') also fails
    bad_rows = {(i["row"], i["column"]) for i in issues}
    assert (3, 2) in bad_rows


@pytest.mark.asyncio
async def test_type_rule_flags_string_in_numeric_column(client):
    sid = await _seed(client)
    await client.put(
        f"/api/v1/sheets/{sid}/cells",
        json={"row": 4, "column": 1, "value": "not-a-number"},
    )
    await client.post(
        f"/api/v1/validation/sheets/{sid}/rules",
        json={"column": 1, "rule_type": "type", "params": {"expected": "number"}},
    )
    run = await client.post(f"/api/v1/validation/sheets/{sid}/run")
    issues = run.json()["issues"]
    assert any(i["row"] == 4 and i["column"] == 1 for i in issues)


@pytest.mark.asyncio
async def test_regex_rule(client):
    sid = await _seed(client)
    await client.post(
        f"/api/v1/validation/sheets/{sid}/rules",
        json={
            "column": 0,
            "rule_type": "regex",
            "params": {"pattern": "^[a-z]+$"},
        },
    )
    # All names are lowercase, no violations expected (header row gets a pass
    # because header is "name" — also lowercase)
    run = await client.post(f"/api/v1/validation/sheets/{sid}/run")
    issues = [i for i in run.json()["issues"] if i["column"] == 0]
    assert issues == []


@pytest.mark.asyncio
async def test_suggest_rules_infers_lookup(client):
    sid = await _seed(client)
    resp = await client.post(f"/api/v1/validation/sheets/{sid}/suggest")
    body = resp.json()
    # status column has small categorical set
    status_rules = [s for s in body["suggestions"] if s["column"] == 2]
    assert any(s["rule_type"] == "lookup" for s in status_rules)


@pytest.mark.asyncio
async def test_suggest_rules_infers_numeric_range(client):
    sid = await _seed(client)
    resp = await client.post(f"/api/v1/validation/sheets/{sid}/suggest")
    body = resp.json()
    price_rules = [s for s in body["suggestions"] if s["column"] == 1]
    assert any(s["rule_type"] == "type" for s in price_rules)
    assert any(s["rule_type"] == "range" for s in price_rules)


@pytest.mark.asyncio
async def test_delete_rule(client):
    sid = await _seed(client)
    create = await client.post(
        f"/api/v1/validation/sheets/{sid}/rules",
        json={"column": 1, "rule_type": "range", "params": {"min": 0}},
    )
    rid = create.json()["id"]
    delete = await client.delete(f"/api/v1/validation/rules/{rid}")
    assert delete.status_code == 204
    listing = await client.get(f"/api/v1/validation/sheets/{sid}/rules")
    assert listing.json() == []
