"""Application configuration loaded from environment / .env file."""
import os
from datetime import timedelta
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


class Settings(BaseSettings):
    """All configuration comes from environment variables or a `.env` file at the
    backend root. See `.env.example` for documentation of every key."""

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Identity ---
    APP_NAME: str = "AICTE Approval Operations Intelligence Platform"
    PROTOTYPE_LABEL: str = "SIH26262 Prototype"
    ENVIRONMENT: str = "development"  # development | testing

    # --- Server ---
    API_HOST: str = "127.0.0.1"
    API_PORT: int = 8000
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # --- Database ---
    SQLALCHEMY_DATABASE_URI: str = "sqlite:///./data/aicte_platform.db"
    DB_ECHO: bool = False

    # --- Security ---
    JWT_SECRET_KEY: str = "CHANGE_ME_LOCAL_DEV_ONLY"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 180

    # --- Object storage ---
    S3_ENABLED: bool = False
    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None
    S3_BUCKET: str = "aicte-documents"
    LOCAL_UPLOAD_DIR: str = "./data/uploads"

    # --- Background jobs ---
    JOB_MODE: str = "inprocess"  # inprocess | celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"

    # --- Email ---
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "AICTE Ops Platform <no-reply@example.local>"

    # --- AI provider (optional) ---
    AI_API_BASE_URL: str | None = None
    AI_API_KEY: str | None = None
    AI_MODEL: str | None = None
    AI_EMBEDDING_MODEL: str | None = None
    AI_TIMEOUT_SECONDS: int = 60

    # --- OCR ---
    TESSERACT_CMD: str | None = None

    # --- Upload constraints ---
    MAX_UPLOAD_MB: int = 25
    ALLOWED_UPLOAD_EXT: set[str] = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_origins(cls, v):
        if isinstance(v, str):
            return _split_csv(v)
        return v

    @field_validator("ALLOWED_UPLOAD_EXT", mode="before")
    @classmethod
    def _parse_ext(cls, v):
        if isinstance(v, str):
            return {e.strip().lower() for e in v.split(",") if e.strip()}
        return v

    @property
    def is_testing(self) -> bool:
        return self.ENVIRONMENT == "testing"

    @property
    def token_expire_delta(self) -> timedelta:
        return timedelta(minutes=self.ACCESS_TOKEN_EXPIRE_MINUTES)

    @property
    def database_is_sqlite(self) -> bool:
        return self.SQLALCHEMY_DATABASE_URI.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
