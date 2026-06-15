from datetime import datetime
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


ConnectionType = Literal[
    "postgres",
    "csv_url",
    "stripe",
    "salesforce",
    "hubspot",
    "google_analytics",
    "snowflake",
    "bigquery",
]


class ConnectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: ConnectionType
    config: dict[str, Any]


class ConnectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    type: str
    last_synced_at: datetime | None
    last_row_count: int | None
    created_at: datetime
    updated_at: datetime


class ConnectionReadWithConfig(ConnectionRead):
    config: dict[str, Any]
