"""API routes — all registered in app/main.py."""

from app.api.shops import router as shops_router
from app.api.negotiations import router as negotiations_router
from app.api.deals import router as deals_router
from app.api.provider_keys import router as provider_keys_router
from app.api.ens import router as ens_router

__all__ = ["shops_router", "negotiations_router", "deals_router", "provider_keys_router", "ens_router"]
