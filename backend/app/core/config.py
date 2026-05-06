from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "dev"
    api_host: str = "0.0.0.0"
    api_port: int = 8108
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/dclaw_sheet"
    redis_url: str = "redis://localhost:6379/0"
    ollama_base_url: str = "http://localhost:11434"


settings = Settings()
