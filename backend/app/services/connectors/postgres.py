from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.services.connectors.base import ConnectorResult


class PostgresConnector:
    """SQLAlchemy-backed connector. Works against any async-capable dialect
    (postgresql+asyncpg, sqlite+aiosqlite, etc.) — we name it 'postgres' for
    YC clarity but the implementation is dialect-portable."""

    type = "postgres"

    def __init__(self, config: dict[str, Any]):
        self.url: str = config["url"]
        self.query: str = config["query"]
        self.max_rows: int = int(config.get("max_rows", 10_000))

    async def fetch(self) -> ConnectorResult:
        engine = create_async_engine(self.url, pool_pre_ping=True)
        try:
            async with engine.connect() as conn:
                result = await conn.execute(text(self.query))
                columns = list(result.keys())
                rows: list[list[Any]] = []
                for idx, row in enumerate(result.mappings()):
                    if idx >= self.max_rows:
                        break
                    rows.append([row.get(c) for c in columns])
        finally:
            await engine.dispose()
        return ConnectorResult(columns=columns, rows=rows)

    def redacted_config(self) -> dict[str, Any]:
        # Mask credentials in the connection URL when echoing back to the user
        masked = self.url
        if "://" in masked and "@" in masked:
            scheme, rest = masked.split("://", 1)
            if "@" in rest:
                _, host_path = rest.split("@", 1)
                masked = f"{scheme}://***@{host_path}"
        return {"url": masked, "query": self.query, "max_rows": self.max_rows}
