"""Sample-data SaaS connectors.

Real OAuth + per-vendor API SDKs are deferred to v2.3.1 — each requires
client secrets and per-tenant install flow that's outside the YC-demo
scope. These connectors return deterministic fixture data shaped like the
real APIs so the rest of the stack (drift detection, RAG, copilot, charts,
pivots, forecasting) can be demoed end-to-end without external creds.

When config["mode"] == "live", the connector will look for credentials
in its config and raise NotImplementedError (clear path to upgrade in
v2.3.1). Default mode is "sample".
"""
from __future__ import annotations

import hashlib
import random
from datetime import date, timedelta
from typing import Any

from app.services.connectors.base import ConnectorResult


def _seeded_rng(name: str, salt: str = "") -> random.Random:
    seed = int(hashlib.sha256(f"{name}-{salt}".encode()).hexdigest()[:8], 16)
    return random.Random(seed)


def _months_back(n: int) -> list[str]:
    today = date.today().replace(day=1)
    out = []
    for i in range(n - 1, -1, -1):
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        out.append(f"{year:04d}-{month:02d}-01")
    return out


class StripeConnector:
    """Stripe-shaped sample: MRR + new MRR + churn + customer count by month."""

    type = "stripe"

    def __init__(self, config: dict[str, Any]):
        self.mode = config.get("mode", "sample")
        self.months = int(config.get("months", 12))

    async def fetch(self) -> ConnectorResult:
        if self.mode == "live":
            raise NotImplementedError("Live Stripe integration ships in v2.3.1")
        rng = _seeded_rng("stripe", str(self.months))
        months = _months_back(self.months)
        columns = ["month", "mrr", "new_mrr", "churn_mrr", "customers"]
        rows: list[list[Any]] = []
        mrr = 50_000
        customers = 120
        for m in months:
            new = rng.randint(4000, 12000)
            churn = rng.randint(1500, 5000)
            mrr = max(10_000, mrr + new - churn)
            customers += rng.randint(-3, 12)
            rows.append([m, mrr, new, churn, customers])
        return ConnectorResult(columns=columns, rows=rows)

    def redacted_config(self) -> dict[str, Any]:
        return {"mode": self.mode, "months": self.months}


class SalesforceConnector:
    """Salesforce-shaped sample: pipeline opportunities."""

    type = "salesforce"

    def __init__(self, config: dict[str, Any]):
        self.mode = config.get("mode", "sample")
        self.count = int(config.get("count", 24))

    async def fetch(self) -> ConnectorResult:
        if self.mode == "live":
            raise NotImplementedError("Live Salesforce integration ships in v2.3.1")
        rng = _seeded_rng("salesforce", str(self.count))
        accounts = [
            "Acme", "Globex", "Initech", "Hooli", "Stark", "Wayne",
            "Pied Piper", "Wonka", "Cyberdyne", "Aperture", "Tyrell", "Umbrella",
        ]
        stages = ["discovery", "qualified", "proposal", "negotiation", "closed-won", "closed-lost"]
        owners = ["alice", "bob", "carol", "dave"]
        today = date.today()
        columns = ["account", "stage", "amount", "owner", "close_date"]
        rows: list[list[Any]] = []
        for _ in range(self.count):
            rows.append(
                [
                    rng.choice(accounts) + " " + rng.choice(["Co", "Inc", "LLC", "Corp"]),
                    rng.choice(stages),
                    rng.randint(5_000, 250_000),
                    rng.choice(owners),
                    (today + timedelta(days=rng.randint(-30, 120))).isoformat(),
                ]
            )
        return ConnectorResult(columns=columns, rows=rows)

    def redacted_config(self) -> dict[str, Any]:
        return {"mode": self.mode, "count": self.count}


class HubspotConnector:
    """Hubspot-shaped sample: contacts + lifecycle stage."""

    type = "hubspot"

    def __init__(self, config: dict[str, Any]):
        self.mode = config.get("mode", "sample")
        self.count = int(config.get("count", 30))

    async def fetch(self) -> ConnectorResult:
        if self.mode == "live":
            raise NotImplementedError("Live HubSpot integration ships in v2.3.1")
        rng = _seeded_rng("hubspot", str(self.count))
        firsts = ["Alex", "Jamie", "Casey", "Riley", "Morgan", "Taylor", "Jordan", "Quinn"]
        lasts = ["Smith", "Jones", "Patel", "Kim", "Garcia", "Nguyen", "Brown", "Davis"]
        domains = ["acme.com", "globex.io", "initech.co", "wayne.net", "stark.ai"]
        stages = ["lead", "marketing-qualified", "sales-qualified", "opportunity", "customer"]
        columns = ["first_name", "last_name", "email", "lifecycle_stage", "lead_score"]
        rows: list[list[Any]] = []
        for _ in range(self.count):
            f, l = rng.choice(firsts), rng.choice(lasts)
            rows.append(
                [
                    f, l,
                    f"{f.lower()}.{l.lower()}@{rng.choice(domains)}",
                    rng.choice(stages),
                    rng.randint(10, 100),
                ]
            )
        return ConnectorResult(columns=columns, rows=rows)

    def redacted_config(self) -> dict[str, Any]:
        return {"mode": self.mode, "count": self.count}


class GoogleAnalyticsConnector:
    """GA-shaped sample: daily sessions + users + conversions."""

    type = "google_analytics"

    def __init__(self, config: dict[str, Any]):
        self.mode = config.get("mode", "sample")
        self.days = int(config.get("days", 30))

    async def fetch(self) -> ConnectorResult:
        if self.mode == "live":
            raise NotImplementedError("Live GA integration ships in v2.3.1")
        rng = _seeded_rng("ga", str(self.days))
        today = date.today()
        columns = ["date", "sessions", "users", "conversions"]
        rows: list[list[Any]] = []
        for i in range(self.days - 1, -1, -1):
            d = today - timedelta(days=i)
            sessions = rng.randint(800, 2400)
            users = int(sessions * rng.uniform(0.55, 0.75))
            conv = int(sessions * rng.uniform(0.012, 0.035))
            rows.append([d.isoformat(), sessions, users, conv])
        return ConnectorResult(columns=columns, rows=rows)

    def redacted_config(self) -> dict[str, Any]:
        return {"mode": self.mode, "days": self.days}


class SnowflakeConnector:
    """Snowflake/BigQuery shape — a query-result-like table; v1 returns
    a small fixed orders table."""

    type = "snowflake"

    def __init__(self, config: dict[str, Any]):
        self.mode = config.get("mode", "sample")
        self.query = config.get("query", "SELECT * FROM orders")
        self.count = int(config.get("count", 20))

    async def fetch(self) -> ConnectorResult:
        if self.mode == "live":
            raise NotImplementedError("Live Snowflake integration ships in v2.3.1")
        rng = _seeded_rng("snowflake", self.query)
        regions = ["NA", "EMEA", "APAC", "LATAM"]
        products = ["Pro", "Team", "Enterprise"]
        columns = ["order_id", "region", "product", "quantity", "amount", "ordered_at"]
        rows: list[list[Any]] = []
        today = date.today()
        for i in range(self.count):
            rows.append(
                [
                    1000 + i,
                    rng.choice(regions),
                    rng.choice(products),
                    rng.randint(1, 50),
                    round(rng.uniform(99, 9999), 2),
                    (today - timedelta(days=rng.randint(0, 60))).isoformat(),
                ]
            )
        return ConnectorResult(columns=columns, rows=rows)

    def redacted_config(self) -> dict[str, Any]:
        return {"mode": self.mode, "query": self.query, "count": self.count}


class BigQueryConnector(SnowflakeConnector):
    """Same shape as Snowflake — both are warehouse query results."""

    type = "bigquery"
