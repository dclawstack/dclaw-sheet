from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "DClaw Sheet"
    app_env: str = "dev"
    debug: bool = True

    database_url: str = "sqlite+aiosqlite:///./dclaw_sheet.db"

    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60

    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.1-8b-instruct"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    ai_provider: str = "auto"  # auto | openrouter | ollama | stub

    # Auth — "dev" = auto-grant a default user; "logto" = verify JWTs via JWKS
    auth_provider: str = "dev"
    logto_jwks_url: str = ""
    logto_issuer: str = ""
    logto_audience: str = ""
    jwks_cache_ttl_seconds: int = 3600
    dev_user_email: str = "dev@dclawstack.local"

    # Demo seed/reset for the landing page. Gate the seed/reset endpoints.
    enable_demo_mode: bool = False
    demo_user_email: str = "demo@dclawstack.io"
    demo_user_name: str = "Demo User"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
