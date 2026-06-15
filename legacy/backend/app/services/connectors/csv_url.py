from __future__ import annotations

import csv
import io
from typing import Any

import httpx

from app.services.connectors.base import ConnectorResult


class CsvUrlConnector:
    type = "csv_url"

    def __init__(self, config: dict[str, Any]):
        self.url: str = config["url"]
        self.has_header: bool = bool(config.get("has_header", True))
        self.max_rows: int = int(config.get("max_rows", 10_000))
        self.headers: dict[str, str] = config.get("headers", {}) or {}

    async def fetch(self) -> ConnectorResult:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.get(self.url, headers=self.headers)
            response.raise_for_status()
        text = response.content.decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(text))
        all_rows = list(reader)
        if not all_rows:
            return ConnectorResult(columns=[], rows=[])
        if self.has_header:
            columns = [str(c) for c in all_rows[0]]
            data_rows = all_rows[1 : self.max_rows + 1]
        else:
            width = max(len(r) for r in all_rows)
            columns = [f"col{i}" for i in range(width)]
            data_rows = all_rows[: self.max_rows]
        return ConnectorResult(columns=columns, rows=[list(r) for r in data_rows])

    def redacted_config(self) -> dict[str, Any]:
        return {"url": self.url, "has_header": self.has_header, "max_rows": self.max_rows}
