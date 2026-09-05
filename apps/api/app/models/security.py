from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PasswordCredential(Base):
    __tablename__ = 'password_credentials'

    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    password_hash: Mapped[str] = mapped_column(Text)
    password_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    failed_attempts: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RecoveryCode(Base):
    __tablename__ = 'recovery_codes'

    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    code_hash: Mapped[str] = mapped_column(Text)
    failed_attempts: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default='active')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TrustedDevicePin(Base):
    __tablename__ = 'trusted_device_pins'

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    pin_hash: Mapped[str] = mapped_column(Text)
    failed_attempts: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trusted_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class E2eeWebKey(Base):
    __tablename__ = 'e2ee_web_keys'

    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(128), primary_key=True, index=True)
    encryption_public_key: Mapped[str] = mapped_column(Text)
    signing_public_key: Mapped[str] = mapped_column(Text)
    algorithm: Mapped[str] = mapped_column(String(64), default='ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
