import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine
from app.models import Membership, User


@pytest.mark.asyncio
async def test_me_exposes_role_and_can_write(client):
    body = (await client.get("/api/v1/me")).json()
    assert body["role"] == "owner"
    assert body["can_write"] is True
    assert body["can_admin"] is True


@pytest.mark.asyncio
async def test_viewer_role_gets_403_on_write(client):
    # Touch any endpoint so the dev user is materialised
    await client.get("/api/v1/me")
    # Downgrade the dev user to viewer directly in the DB
    async with AsyncSession(engine, expire_on_commit=False) as db:
        user = (await db.execute(select(User))).scalars().first()
        membership = (
            await db.execute(
                select(Membership).where(Membership.user_id == user.id)
            )
        ).scalar_one()
        membership.role = "viewer"
        await db.commit()

    me = (await client.get("/api/v1/me")).json()
    assert me["role"] == "viewer"
    assert me["can_write"] is False

    resp = await client.post("/api/v1/workbooks", json={"name": "should fail"})
    assert resp.status_code == 403
