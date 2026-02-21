"""
Application configuration loaded from environment variables.

Uses pydantic-settings for type-safe env var parsing with automatic
.env file loading. All secrets are injected via environment — never
hard-coded.

To extend: add new fields here and document them in .env.example.
See https://docs.pydantic.dev/latest/concepts/pydantic_settings/
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ─── Core ──────────────────────────────────────────────────────
    environment: str = "development"
    debug: bool = False

    # ─── MongoDB ───────────────────────────────────────────────────
    # Local dev default matches the Docker Compose mongo service.
    # In production, replace with an Atlas connection string.
    mongo_uri: str = "mongodb://root:devpassword@localhost:27017/truthguard?authSource=admin"
    mongo_db_name: str = "truthguard"

    # ─── CORS ──────────────────────────────────────────────────────
    # Comma-separated allowed origins. The web app + extension both need this.
    cors_origins_str: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_str.split(",") if o.strip()]

    # ─── AI ────────────────────────────────────────────────────────
    # Get from https://aistudio.google.com/
    gemini_api_key: str = ""

    # When True, all AI calls return canned mock responses.
    # Always True in tests; set False in production with a real key.
    ai_mock_mode: bool = True

    # ─── Optional integrations ─────────────────────────────────────
    # These degrade gracefully when not set (see ai/ adapters).
    serper_api_key: str = ""  # https://serper.dev/
    google_fact_check_api_key: str = ""  # Google Fact Check Tools API

    # ─── Auth (Phase 1) ────────────────────────────────────────────
    # IMPORTANT: Change jwt_secret to a long random string in production.
    # Generate: python -c "import secrets; print(secrets.token_hex(32))"
    jwt_secret: str = "changeme-in-production-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Don't fail on unknown env vars
    )


# Module-level singleton — import this everywhere instead of instantiating Settings()
settings = Settings()
