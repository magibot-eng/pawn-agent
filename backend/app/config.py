"""Application-wide configuration loaded from environment variables."""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings. Values come from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application
    app_name: str = "Pawn Agent"
    debug: bool = False

    # Database
    database_url: str = "sqlite+aiosqlite:///./pawn_agent.db"

    # Encryption (32-byte hex string for AES-256)
    master_encryption_key: str = ""

    # Chains
    base_sepolia_rpc_url: str = ""

    # Merchant wallet / CDP Agentic Wallet integration
    cdp_wallet_live_enabled: bool = False
    cdp_wallet_fallback_to_stub: bool = True
    cdp_wallet_chain: str = "base-sepolia"
    cdp_wallet_cli_command: str = "npx awal"

    # Frontend URL (for CORS)
    frontend_url: str = "http://localhost:3000"

    @property
    def is_production(self) -> bool:
        return not self.debug


@lru_cache
def get_settings() -> Settings:
    return Settings()
