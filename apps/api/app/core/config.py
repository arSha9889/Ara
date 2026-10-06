from pathlib import Path
import re
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


API_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = 'AraChat API'
    environment: str = 'dev'
    api_prefix: str = '/api'
    allowed_origins: list[str] = [
        'http://localhost:5173',
        'http://localhost:1420',
        'tauri://localhost',
        'http://tauri.localhost',
    ]
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
    vk_oauth_service_token: str = ''
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
    # This prefix remains part of legacy local storage keys, not a public HTTP route.
    storage_public_url_prefix: str = '/storage/uploads'
    storage_backend: Literal['local', 's3'] = 'local'
    s3_endpoint_url: str = ''
    s3_region: str = 'auto'
    s3_bucket: str = ''
    s3_access_key_id: str = ''
    s3_secret_access_key: str = ''
    s3_prefix: str = 'uploads'
    vapid_private_key: str = ''
    vapid_public_key: str = ''
    vapid_claims_email: str = ''
    mobile_push_enabled: bool = True
    mobile_push_timeout_seconds: int = Field(default=10, ge=1, le=60)
    rustore_push_project_id: str = ''
    rustore_push_service_token: str = ''
    fcm_push_project_id: str = ''
    fcm_service_account_file: str = ''
    android_latest_version_code: int | None = Field(default=None, ge=1)
    android_latest_version_name: str = ''
    android_release_notes_ru: list[str] = Field(default_factory=list)
    android_release_notes_en: list[str] = Field(default_factory=list)
    android_direct_download_url: str = ''
    android_rustore_app_url: str = ''
    android_rustore_installer_package: str = ''
    turn_public_host: str = ''
    turn_shared_secret: str = ''
    turn_port: int = Field(default=3478, ge=1, le=65535)
    turn_credential_ttl_seconds: int = Field(default=3600, ge=60, le=86400)
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
            }
            missing = [name for name, value in required_settings.items() if not value.strip()]
            if missing:
                raise ValueError(f'S3 storage requires: {", ".join(missing)}')
        for setting_name in ('android_direct_download_url', 'android_rustore_app_url'):
            value = getattr(self, setting_name).strip()
            if value and not _is_https_url(value):
                raise ValueError(f'{setting_name} must be an HTTPS URL without credentials or query parameters')
        installer_package = self.android_rustore_installer_package.strip()
        if installer_package and not _is_android_package_name(installer_package):
            raise ValueError('android_rustore_installer_package must be a valid Android package name')

    @property
    def smtp_is_configured(self) -> bool:
        return bool(self.smtp_host.strip() and self.smtp_from_email.strip())


def _is_https_url(value: str) -> bool:
    parsed = urlparse(value)
    return (
        parsed.scheme == 'https'
        and bool(parsed.netloc)
        and not parsed.username
        and not parsed.password
        and not parsed.query
        and not parsed.fragment
    )


def _is_android_package_name(value: str) -> bool:
    return bool(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+', value))


settings = Settings()
