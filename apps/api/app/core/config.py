from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


API_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = 'AraChat API'
    environment: str = 'dev'
    api_prefix: str = '/api'
    allowed_origins: list[str] = ['http://localhost:5173']
    database_url: str = 'postgresql+asyncpg://nexus:nexus@localhost:5432/nexus'
    redis_url: str = 'redis://localhost:6379/0'
    telegram_bot_token: str = ''
    telegram_bot_name: str = ''
    telegram_webhook_secret: str = ''
    admin_phone: str = ''
    admin_email: str = ''
    smtp_host: str = ''
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ''
    smtp_password: str = ''
    smtp_from_email: str = ''
    smtp_from_name: str = 'AraChat'
    smtp_use_starttls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = Field(default=15, ge=1, le=120)
    public_base_url: str = ''
    yandex_oauth_client_id: str = ''
    yandex_oauth_client_secret: str = ''
    vk_oauth_client_id: str = ''
    vk_oauth_client_secret: str = ''
    registration_proof_secret: str = 'dev-registration-proof-secret-change-me'
    access_token_secret: str = 'dev-access-token-secret-change-me'
    access_token_algorithm: str = 'HS256'
    access_token_minutes: int = 15
    refresh_token_days: int = 180
    pin_trusted_days: int = 365
    pin_lock_minutes: int = 30
    max_auth_attempts: int = 5
    nexus_id_length: int = 16
    early_access_bypass_limit: int = Field(default=100, ge=0)
    password_hash_time_cost: int = Field(default=3, ge=1)
    password_hash_memory_cost: int = Field(default=65536, ge=8192)
    password_hash_parallelism: int = Field(default=4, ge=1)
    upload_dir: str = 'storage/uploads'
    upload_max_size_bytes: int = Field(default=30 * 1024 * 1024, ge=1)
    storage_public_url_prefix: str = '/storage/uploads'
    storage_public_base_url: str = ''
    storage_backend: Literal['local', 's3'] = 'local'
    s3_endpoint_url: str = ''
    s3_region: str = 'auto'
    s3_bucket: str = ''
    s3_access_key_id: str = ''
    s3_secret_access_key: str = ''
    s3_prefix: str = 'uploads'
    s3_public_base_url: str = ''
    vapid_private_key: str = ''
    vapid_public_key: str = ''
    vapid_claims_email: str = ''
    maintenance_status_file: str = '/var/lib/arachat/maintenance/storage-status.json'
    verification_retention_days: int = Field(default=30, ge=1)
    oauth_attempt_retention_days: int = Field(default=7, ge=1)
    session_retention_days: int = Field(default=30, ge=1)
    login_history_retention_days: int = Field(default=180, ge=1)
    read_notification_retention_days: int = Field(default=30, ge=1)
    unread_notification_retention_days: int = Field(default=90, ge=1)
    audit_log_retention_days: int = Field(default=365, ge=30)
    upload_orphan_retention_days: int = Field(default=1, ge=1)
    deleted_message_retention_days: int = Field(default=30, ge=1)
    retention_batch_size: int = Field(default=100, ge=1, le=1000)

    model_config = SettingsConfigDict(env_prefix='NEXUS_', env_file=API_DIR / '.env', extra='ignore')

    def model_post_init(self, __context: object) -> None:
        if self.database_url.startswith('postgres://'):
            self.database_url = self.database_url.replace('postgres://', 'postgresql+asyncpg://', 1)
        elif self.database_url.startswith('postgresql://'):
            self.database_url = self.database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
        if self.storage_backend == 's3':
            required_settings = {
                'NEXUS_S3_ENDPOINT_URL': self.s3_endpoint_url,
                'NEXUS_S3_BUCKET': self.s3_bucket,
                'NEXUS_S3_ACCESS_KEY_ID': self.s3_access_key_id,
                'NEXUS_S3_SECRET_ACCESS_KEY': self.s3_secret_access_key,
                'NEXUS_S3_PUBLIC_BASE_URL': self.s3_public_base_url,
            }
            missing = [name for name, value in required_settings.items() if not value.strip()]
            if missing:
                raise ValueError(f'S3 storage requires: {", ".join(missing)}')

    @property
    def smtp_is_configured(self) -> bool:
        return bool(self.smtp_host.strip() and self.smtp_from_email.strip())


settings = Settings()
