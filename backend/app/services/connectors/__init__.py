from app.services.connectors.base import Connector, ConnectorResult
from app.services.connectors.csv_url import CsvUrlConnector
from app.services.connectors.postgres import PostgresConnector
from app.services.connectors.drift import DriftReport, compute_drift
from app.services.connectors.saas import (
    BigQueryConnector,
    GoogleAnalyticsConnector,
    HubspotConnector,
    SalesforceConnector,
    SnowflakeConnector,
    StripeConnector,
)

__all__ = [
    "Connector",
    "ConnectorResult",
    "CsvUrlConnector",
    "PostgresConnector",
    "DriftReport",
    "compute_drift",
    "build_connector",
    "SUPPORTED_TYPES",
]


_REGISTRY: dict[str, type] = {
    "csv_url": CsvUrlConnector,
    "postgres": PostgresConnector,
    "stripe": StripeConnector,
    "salesforce": SalesforceConnector,
    "hubspot": HubspotConnector,
    "google_analytics": GoogleAnalyticsConnector,
    "snowflake": SnowflakeConnector,
    "bigquery": BigQueryConnector,
}

SUPPORTED_TYPES: tuple[str, ...] = tuple(_REGISTRY.keys())


def build_connector(conn_type: str, config: dict) -> Connector:
    """Factory: pick the right connector implementation for a type."""
    cls = _REGISTRY.get(conn_type)
    if cls is None:
        raise ValueError(f"Unknown connector type: {conn_type}")
    return cls(config)
