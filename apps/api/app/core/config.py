from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


API_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = 'Nexus API'
    environment: str = 'dev'
    api_prefix: str = '/api'
    allowed_origins: list[str] = ['http://localhost:5173']
    database_url: str = 'postgresql+asyncpg://nexus:nexus@localhost:5432/nexus'
    redis_url: str = 'redis://localhost:6379/0'
    telegram_bot_token: str = ''
    telegram_bot_name: str = ''
    telegram_webhook_secret: str = ''
    registration_proof_secret: str = 'dev-registration-proof-secret-change-me'
    access_token_secret: str = 'dev-access-token-secret-change-me'
    access_token_algorithm: str = 'HS256'
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    pin_trusted_days: int = 365
    pin_lock_minutes: int = 30
    max_auth_attempts: int = 5
    nexus_id_length: int = 16
    early_access_bypass_limit: int = Field(default=100, ge=0)
    password_hash_time_cost: int = Field(default=3, ge=1)
    password_hash_memory_cost: int = Field(default=65536, ge=8192)
    password_hash_parallelism: int = Field(default=4, ge=1)
    upload_dir: str = 'storage/uploads'
    upload_max_size_bytes: int = Field(default=100 * 1024 * 1024, ge=1)
    storage_public_url_prefix: str = '/storage/uploads'
    storage_public_base_url: str = ''
    vapid_private_key: str = ''
    vapid_public_key: str = ''
    vapid_claims_email: str = ''

    model_config = SettingsConfigDict(env_prefix='NEXUS_', env_file=API_DIR / '.env', extra='ignore')

    def model_post_init(self, __context: object) -> None:
        if self.database_url.startswith('postgres://'):
            self.database_url = self.database_url.replace('postgres://', 'postgresql+asyncpg://', 1)
        elif self.database_url.startswith('postgresql://'):
            self.database_url = self.database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)


settings = Settings()
