from app.services.connectors.base import Connector, ConnectorResult
from app.services.connectors.csv_url import CsvUrlConnector
from app.services.connectors.postgres import PostgresConnector
from app.services.connectors.drift import DriftReport, compute_drift

__all__ = [
    "Connector",
    "ConnectorResult",
    "CsvUrlConnector",
    "PostgresConnector",
    "DriftReport",
    "compute_drift",
    "build_connector",
]


def build_connector(conn_type: str, config: dict) -> Connector:
    """Factory: pick the right connector implementation for a type."""
    if conn_type == "csv_url":
        return CsvUrlConnector(config)
    if conn_type == "postgres":
        return PostgresConnector(config)
    raise ValueError(f"Unknown connector type: {conn_type}")
