import os
import uuid
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.middleware.gzip import GZipMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.core.logging import configure_logging, get_logger
from app.api.routes import health
from app.api.v1 import (
    workbooks, sheets, ai, connections, events, me, forecast,
    validation, history, templates, rag, automations, plans, collab,
    demo,
)

configure_logging()
logger = get_logger()

if os.environ.get("SENTRY_DSN"):
    sentry_sdk.init(dsn=os.environ["SENTRY_DSN"], traces_sample_rate=0.1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def add_request_id(request, call_next):
    rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.bind_contextvars(request_id=rid)
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    logger.info(
        "request",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
    )
    return response


@app.get("/health")
async def health_root(response: Response):
    response.headers["Cache-Control"] = "public, max-age=30"
    return {"status": "ok"}

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
app.include_router(demo.router, prefix="/api/v1", tags=["demo"])
