"""Pawn Agent backend — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import shops_router, negotiations_router, deals_router, provider_keys_router, ens_router
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run on startup and shutdown."""
    await init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        description="ENS-native AI token buyout platform — merchant backend.",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register API routers
    app.include_router(shops_router)
    app.include_router(negotiations_router)
    app.include_router(deals_router)
    app.include_router(provider_keys_router)
    app.include_router(ens_router)

    @app.get("/health")
    async def health():
        return {"status": "ok", "app": settings.app_name}

    @app.get("/debug/settings")
    async def debug_settings():
        s = get_settings()
        return {
            "cdp_wallet_live_enabled": s.cdp_wallet_live_enabled,
            "cdp_wallet_fallback_to_stub": s.cdp_wallet_fallback_to_stub,
            "alchemy_wallet_master_seed_set": bool(s.alchemy_wallet_master_seed),
            "database_url_is_pg": "postgresql" in s.database_url,
        }

    return app


app = create_app()
