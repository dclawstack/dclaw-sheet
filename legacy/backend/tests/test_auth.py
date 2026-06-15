"""Auth + multi-tenancy tests.

Dev-mode: every request gets the same default user; the existing test
fixture already exercises this path implicitly. These tests confirm:

- /api/v1/me returns the dev user + workspace
- Newly-created workbooks carry workspace_id
- Listing workbooks only returns rows for the caller's workspace
- A workbook belonging to a different workspace is invisible (returns 404)
"""
import os
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import Org, User, Workspace


@pytest.mark.asyncio
async def test_me_returns_dev_user_and_workspace(client):
    me = await client.get("/api/v1/me")
    assert me.status_code == 200
    body = me.json()
    assert body["auth_provider"] == "dev"
    assert body["user"]["email"] == settings.dev_user_email
    assert body["workspace"]["id"]


@pytest.mark.asyncio
async def test_created_workbook_carries_workspace_id(client):
    me = (await client.get("/api/v1/me")).json()
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    assert wb["workspace_id"] == me["workspace"]["id"]


@pytest.mark.asyncio
async def test_other_workspace_workbook_is_invisible(client):
    # Seed a foreign workspace + workbook directly via the DB
    from app.core.database import engine
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.models import Workbook
    from app.core.utils import utc_now
    from datetime import datetime

    async with AsyncSession(engine, expire_on_commit=False) as db:
        other_org = Org(name="Other", slug="other")
        db.add(other_org)
        await db.commit()
        await db.refresh(other_org)
        other_ws = Workspace(org_id=other_org.id, name="Other WS")
        db.add(other_ws)
        await db.commit()
        await db.refresh(other_ws)
        foreign = Workbook(workspace_id=other_ws.id, name="foreign", description=None)
        db.add(foreign)
        await db.commit()
        await db.refresh(foreign)
        foreign_id = foreign.id

    listing = (await client.get("/api/v1/workbooks")).json()
    assert all(item["id"] != str(foreign_id) for item in listing["items"])
    get_resp = await client.get(f"/api/v1/workbooks/{foreign_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_logto_mode_rejects_missing_token(client, monkeypatch):
    """When AUTH_PROVIDER=logto, requests without a Bearer token get 401."""
    monkeypatch.setattr(settings, "auth_provider", "logto")
    response = await client.get("/api/v1/workbooks")
    assert response.status_code == 401
    assert response.headers.get("www-authenticate", "").lower() == "bearer"


@pytest.mark.asyncio
async def test_logto_mode_rejects_bogus_token(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_provider", "logto")
    monkeypatch.setattr(settings, "logto_jwks_url", "https://example.invalid/jwks.json")
    response = await client.get(
        "/api/v1/workbooks", headers={"Authorization": "Bearer not.a.real.jwt"}
    )
    # Either 401 (decode failure) or 500 (JWKS unreachable) — both block access
    assert response.status_code in (401, 500)
