from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Lattice TrustAnchor"
    app_env: str = "local"
    app_debug: bool = True
    api_v1_prefix: str = "/api/v1"
    cors_allow_origins: list[str] = ["*"]

    database_url: str = "postgresql+psycopg://lattice:lattice@localhost:5432/lattice"
    init_db_on_startup: bool = False
    lattice_api_key: str | None = None

    squad_base_url: str = "https://sandbox-api-d.squadco.com"
    squad_secret_key: str | None = None
    squad_public_key: str | None = None
    squad_webhook_secret: str | None = None
    squad_merchant_id: str | None = None
    squad_sms_endpoint: str = "/sms/send/instant"
    squad_sms_sender_id: str = "Lattice"

    viq_signing_secret: str = Field(default="change-this-before-demo", min_length=16)
    deepfake_model_path: str | None = None
    deepfake_threshold: float = 0.85
    face_match_threshold: float = 0.92
    otp_ttl_seconds: int = 90

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
