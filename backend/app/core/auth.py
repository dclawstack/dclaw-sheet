"""Auth dependencies.

Two providers:
- "dev"    : auto-grants every request a default user attached to a default
             workspace. The user/workspace are created on first request if
             they don't already exist (alembic 0004_auth pre-seeds them when
             migrations drive the DB).
- "logto"  : verifies a JWT from `Authorization: Bearer <token>` against the
             Logto JWKS endpoint. The token's `sub`/`email` claims are used
             to upsert a `User` row and ensure a personal workspace exists.

Both providers ultimately return a User; `get_current_workspace()` resolves
its default workspace and a `WorkspaceScope` wrapper is what every router
uses to filter by workspace_id.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models import Membership, Org, User, Workspace

log = logging.getLogger(__name__)

_JWKS_CACHE: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Dev mode — lazy-bootstrap a default org / workspace / user / membership
# ---------------------------------------------------------------------------


async def _ensure_default_workspace(db: AsyncSession) -> Workspace:
    org = (await db.execute(select(Org).where(Org.slug == "default"))).scalar_one_or_none()
    if org is None:
        org = Org(name="Default Org", slug="default")
        db.add(org)
        await db.commit()
        await db.refresh(org)
    ws = (
        await db.execute(select(Workspace).where(Workspace.org_id == org.id))
    ).scalars().first()
    if ws is None:
        ws = Workspace(org_id=org.id, name="Default Workspace")
        db.add(ws)
        await db.commit()
        await db.refresh(ws)
    return ws


async def _ensure_user(
    db: AsyncSession,
    email: str,
    *,
    external_id: str | None = None,
    name: str | None = None,
) -> User:
    if external_id:
        user = (
            await db.execute(select(User).where(User.external_id == external_id))
        ).scalar_one_or_none()
        if user is not None:
            return user
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        ws = await _ensure_default_workspace(db)
        user = User(
            email=email,
            name=name,
            external_id=external_id,
            default_workspace_id=ws.id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        await _ensure_membership(db, user.id, ws.id, role="owner")
    elif external_id and user.external_id is None:
        user.external_id = external_id
        await db.commit()
        await db.refresh(user)
    if user.default_workspace_id is None:
        ws = await _ensure_default_workspace(db)
        user.default_workspace_id = ws.id
        await db.commit()
        await db.refresh(user)
        await _ensure_membership(db, user.id, ws.id, role="owner")
    return user


async def _ensure_membership(
    db: AsyncSession, user_id: UUID, workspace_id: UUID, role: str = "member"
) -> None:
    existing = (
        await db.execute(
            select(Membership).where(
                Membership.user_id == user_id, Membership.workspace_id == workspace_id
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(Membership(user_id=user_id, workspace_id=workspace_id, role=role))
        await db.commit()


# ---------------------------------------------------------------------------
# Logto mode — JWT validation via JWKS
# ---------------------------------------------------------------------------


async def _fetch_jwks(url: str) -> dict[str, Any]:
    cached = _JWKS_CACHE.get(url)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
        jwks = r.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"JWKS unreachable: {exc}",
        )
    _JWKS_CACHE[url] = jwks
    return jwks


def _select_signing_key(jwks: dict[str, Any], kid: str | None) -> Any:
    for key in jwks.get("keys", []):
        if kid is None or key.get("kid") == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="JWKS kid mismatch")


async def _verify_logto_jwt(token: str) -> dict[str, Any]:
    if not settings.logto_jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="LOGTO_JWKS_URL not configured",
        )
    jwks = await _fetch_jwks(settings.logto_jwks_url)
    try:
        unverified = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    key = _select_signing_key(jwks, unverified.get("kid"))
    try:
        claims = jwt.decode(
            token,
            key=key,
            algorithms=["RS256"],
            audience=settings.logto_audience or None,
            issuer=settings.logto_issuer or None,
            options={"verify_aud": bool(settings.logto_audience)},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}")
    return claims


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


def _extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    if settings.auth_provider == "dev":
        return await _ensure_user(db, settings.dev_user_email, name="Default Dev User")
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = await _verify_logto_jwt(token)
    email = claims.get("email") or f"{claims.get('sub')}@logto.local"
    return await _ensure_user(
        db,
        email,
        external_id=str(claims.get("sub")) if claims.get("sub") else None,
        name=claims.get("name"),
    )


@dataclass
class WorkspaceScope:
    user: User
    workspace: Workspace
    role: str = "owner"

    @property
    def can_write(self) -> bool:
        return self.role in ("owner", "admin", "editor")

    @property
    def can_admin(self) -> bool:
        return self.role in ("owner", "admin")


async def get_current_workspace(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceScope:
    if user.default_workspace_id is None:
        ws = await _ensure_default_workspace(db)
        user.default_workspace_id = ws.id
        await db.commit()
        await db.refresh(user)
    else:
        ws = (
            await db.execute(select(Workspace).where(Workspace.id == user.default_workspace_id))
        ).scalar_one()
    # Look up the caller's role on this workspace via Membership.
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.workspace_id == ws.id,
            )
        )
    ).scalar_one_or_none()
    role = membership.role if membership else "viewer"
    # Stamp the actor on this session so the cell repo can populate
    # CellChange.actor_email when rows are mutated.
    from app.services.history import set_actor
    set_actor(db, user.email)
    return WorkspaceScope(user=user, workspace=ws, role=role)


def require_writer(scope: "WorkspaceScope" = Depends(get_current_workspace)) -> "WorkspaceScope":
    """Dependency that 403s callers whose role can't write."""
    if not scope.can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{scope.role}' lacks write permission",
        )
    return scope


def require_admin(scope: "WorkspaceScope" = Depends(get_current_workspace)) -> "WorkspaceScope":
    if not scope.can_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{scope.role}' lacks admin permission",
        )
    return scope
