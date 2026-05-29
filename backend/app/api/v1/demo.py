"""Demo seed/reset router for the landing page.

To remove the demo feature, delete this file, app/services/demo.py, and the
demo router include in app/api/main.py.
"""
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services.demo import gather_status, reset_demo, seed_demo

router = APIRouter()


def _require_enabled() -> None:
    if not settings.enable_demo_mode:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Demo mode is disabled (set ENABLE_DEMO_MODE=true)",
        )


@router.get("/demo/status")
async def demo_status(db: AsyncSession = Depends(get_db)) -> dict:
    """Returns enabled:false (200) when the flag is off so the landing page
    can hide the demo section quietly instead of erroring."""
    return asdict(await gather_status(db, enabled=settings.enable_demo_mode))


@router.post("/demo/seed")
async def demo_seed(db: AsyncSession = Depends(get_db)) -> dict:
    _require_enabled()
    return asdict(await seed_demo(db))


@router.delete("/demo/reset")
async def demo_reset(db: AsyncSession = Depends(get_db)) -> dict:
    _require_enabled()
    return asdict(await reset_demo(db))
