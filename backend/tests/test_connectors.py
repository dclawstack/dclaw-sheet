import asyncio
import os
import tempfile
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from app.services.connectors import build_connector


@pytest.mark.asyncio
async def test_postgres_connector_against_sqlite():
    """The 'postgres' connector is dialect-portable — wire it to SQLite."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "src.db"
        url = f"sqlite+aiosqlite:///{db_path}"
        engine = create_async_engine(url)
        async with engine.begin() as conn:
            await conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, score REAL)"))
            await conn.execute(
                text("INSERT INTO users (id, name, score) VALUES (1, 'alice', 10.5), (2, 'bob', 20)")
            )
        await engine.dispose()

        connector = build_connector(
            "postgres",
            {"url": url, "query": "SELECT id, name, score FROM users ORDER BY id"},
        )
        result = await connector.fetch()
        assert result.columns == ["id", "name", "score"]
        assert result.row_count == 2
        assert result.rows[0][1] == "alice"


@pytest.mark.asyncio
async def test_csv_url_connector(monkeypatch):
    csv_body = b"name,age\nAlice,30\nBob,25\n"

    class FakeResponse:
        content = csv_body
        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return False
        async def get(self, *args, **kwargs):
            return FakeResponse()

    import app.services.connectors.csv_url as mod
    monkeypatch.setattr(mod.httpx, "AsyncClient", FakeClient)

    connector = build_connector("csv_url", {"url": "https://example.com/data.csv"})
    result = await connector.fetch()
    assert result.columns == ["name", "age"]
    assert result.rows == [["Alice", "30"], ["Bob", "25"]]


@pytest.mark.asyncio
async def test_unknown_connector_type_raises():
    with pytest.raises(ValueError):
        build_connector("snowflake", {"url": "x"})
