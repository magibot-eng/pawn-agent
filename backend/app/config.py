"""Application-wide configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
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

    # Frontend URL(s) for CORS
    frontend_url: str = "http://localhost:3000"
    frontend_origins: list[str] = Field(default_factory=list)

    @property
    def cors_origins(self) -> list[str]:
        origins = [self.frontend_url, "http://localhost:3000"]
        origins.extend(self.frontend_origins)

        seen: set[str] = set()
        unique: list[str] = []
        for origin in origins:
            cleaned = origin.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            unique.append(cleaned)
        return unique

    @property
    def is_production(self) -> bool:
        return not self.debug


@lru_cache
def get_settings() -> Settings:
    return Settings()
