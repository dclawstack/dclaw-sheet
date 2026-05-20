from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class ConnectorResult:
    """Tabular result from a connector fetch."""

    columns: list[str]
    rows: list[list[Any]]

    @property
    def row_count(self) -> int:
        return len(self.rows)


class Connector(Protocol):
    """Async fetch contract for every live-data connector."""

    type: str

    async def fetch(self) -> ConnectorResult: ...

    def redacted_config(self) -> dict[str, Any]:
        """Return the connector config with secret fields masked."""
        ...
