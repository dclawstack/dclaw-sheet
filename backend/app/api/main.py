from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.api.routes import health
from app.api.v1 import (
    workbooks, sheets, ai, connections, events, me, forecast,
    validation, history, templates, rag, automations, plans, collab,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(workbooks.router, prefix="/api/v1/workbooks", tags=["workbooks"])
app.include_router(sheets.router, prefix="/api/v1", tags=["sheets"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(connections.router, prefix="/api/v1/connections", tags=["connections"])
app.include_router(events.router, prefix="/api/v1/events", tags=["events"])
app.include_router(me.router, prefix="/api/v1/me", tags=["me"])
app.include_router(forecast.router, prefix="/api/v1/forecast", tags=["forecast"])
app.include_router(validation.router, prefix="/api/v1/validation", tags=["validation"])
app.include_router(history.router, prefix="/api/v1/history", tags=["history"])
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"])
app.include_router(rag.router, prefix="/api/v1/rag", tags=["rag"])
app.include_router(automations.router, prefix="/api/v1/automations", tags=["automations"])
app.include_router(plans.router, prefix="/api/v1/plans", tags=["plans"])
app.include_router(collab.router, prefix="/api/v1/collab", tags=["collab"])
