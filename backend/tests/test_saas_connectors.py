import pytest

from app.services.connectors import build_connector, SUPPORTED_TYPES


@pytest.mark.asyncio
async def test_stripe_sample_returns_monthly_mrr_table():
    c = build_connector("stripe", {"mode": "sample", "months": 6})
    result = await c.fetch()
    assert result.columns == ["month", "mrr", "new_mrr", "churn_mrr", "customers"]
    assert result.row_count == 6
    assert all(isinstance(r[1], int) for r in result.rows)


@pytest.mark.asyncio
async def test_stripe_is_deterministic():
    a = await build_connector("stripe", {"months": 4}).fetch()
    b = await build_connector("stripe", {"months": 4}).fetch()
    assert a.rows == b.rows


@pytest.mark.asyncio
async def test_salesforce_pipeline_shape():
    result = await build_connector("salesforce", {"count": 5}).fetch()
    assert result.columns == ["account", "stage", "amount", "owner", "close_date"]
    assert result.row_count == 5


@pytest.mark.asyncio
async def test_hubspot_contacts_shape():
    result = await build_connector("hubspot", {"count": 3}).fetch()
    assert result.columns == ["first_name", "last_name", "email", "lifecycle_stage", "lead_score"]
    assert result.row_count == 3


@pytest.mark.asyncio
async def test_google_analytics_daily_shape():
    result = await build_connector("google_analytics", {"days": 7}).fetch()
    assert result.columns == ["date", "sessions", "users", "conversions"]
    assert result.row_count == 7


@pytest.mark.asyncio
async def test_snowflake_and_bigquery_orders_shape():
    s = await build_connector("snowflake", {"count": 4}).fetch()
    bq = await build_connector("bigquery", {"count": 4}).fetch()
    assert s.columns == ["order_id", "region", "product", "quantity", "amount", "ordered_at"]
    assert bq.columns == s.columns


@pytest.mark.asyncio
async def test_live_mode_raises_not_implemented():
    c = build_connector("stripe", {"mode": "live"})
    with pytest.raises(NotImplementedError):
        await c.fetch()


@pytest.mark.asyncio
async def test_supported_types_includes_all():
    assert {
        "csv_url",
        "postgres",
        "stripe",
        "salesforce",
        "hubspot",
        "google_analytics",
        "snowflake",
        "bigquery",
    } <= set(SUPPORTED_TYPES)


@pytest.mark.asyncio
async def test_create_stripe_connection_and_sync(client):
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    conn = await client.post(
        "/api/v1/connections",
        json={"name": "Stripe Demo", "type": "stripe", "config": {"months": 6}},
    )
    assert conn.status_code == 201
    cid = conn.json()["id"]
    sync = await client.post(f"/api/v1/connections/{cid}/sync/{wb['id']}")
    assert sync.status_code == 201
    sid = sync.json()["sheet"]["id"]
    cells = (await client.get(f"/api/v1/sheets/{sid}/cells")).json()
    by = {(c["row"], c["column"]): c for c in cells}
    # Header row
    assert by[(0, 0)]["value"] == "month"
    assert by[(0, 1)]["value"] == "mrr"
    # 6 data rows
    assert max(c["row"] for c in cells) == 6
