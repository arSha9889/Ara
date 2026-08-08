import asyncio
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from pathlib import PurePosixPath
from tempfile import NamedTemporaryFile
from uuid import UUID, uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import UploadFile

from app.core.config import settings
from app.services.auth_service import AuthError

API_ROOT = Path(__file__).resolve().parents[2]
CHUNK_SIZE = 1024 * 1024
AVATAR_MAX_SIZE_BYTES = 30 * 1024 * 1024

ALLOWED_MIME_TYPES = {
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'application/pdf',
    'text/plain',
}

EXTENSIONS_BY_MIME_TYPE = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/webm': '.webm',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
}


@dataclass(frozen=True)
class StoredUpload:
    public_path: str
    original_name: str
    mime_type: str
    size_bytes: int
    suggested_message_type: str


def storage_root() -> Path:
    path = Path(settings.upload_dir)
    if not path.is_absolute():
        path = API_ROOT / path
    return path


@lru_cache
def get_s3_client():
    return boto3.client(
        's3',
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        config=Config(signature_version='s3v4', retries={'max_attempts': 3, 'mode': 'standard'}),
    )


async def save_upload_file(upload: UploadFile, user_id: UUID, max_size_bytes: int | None = None) -> StoredUpload:
    mime_type = _normalize_mime_type(upload.content_type)
    if mime_type not in ALLOWED_MIME_TYPES:
        raise AuthError('Unsupported upload type')

    original_name = _clean_filename(upload.filename or 'upload')
    extension = EXTENSIONS_BY_MIME_TYPE[mime_type]
    stored_name = f'{uuid4().hex}{extension}'
    is_s3 = settings.storage_backend == 's3'
    object_key = _s3_object_key(user_id, stored_name) if is_s3 else ''
    target_path: Path
    if is_s3:
        temporary_file = NamedTemporaryFile(prefix='nexus-upload-', delete=False)
        target_path = Path(temporary_file.name)
        temporary_file.close()
    else:
        relative_dir = Path(str(user_id))
        target_dir = storage_root() / relative_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / stored_name
    size_bytes = 0
    header = b''

    try:
        with target_path.open('wb') as output:
            while chunk := await upload.read(CHUNK_SIZE):
                if not header:
                    header = chunk[:512]
                    _validate_file_signature(mime_type, header)
                size_bytes += len(chunk)
                if size_bytes > (max_size_bytes or settings.upload_max_size_bytes):
                    raise AuthError('Upload is too large')
                output.write(chunk)
        if is_s3:
            await _upload_to_s3(target_path, object_key, mime_type)
    except Exception:
        target_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    if is_s3:
        target_path.unlink(missing_ok=True)
        public_path = object_key
    else:
        public_prefix = settings.storage_public_url_prefix.rstrip('/')
        public_path = f'{public_prefix}/{user_id}/{stored_name}'

    return StoredUpload(
        public_path=public_path,
        original_name=original_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
        suggested_message_type=_suggest_message_type(mime_type),
    )


def media_url_for(public_path: str, request_base_url: str) -> str:
    if settings.storage_backend == 's3':
        return f'{settings.s3_public_base_url.rstrip("/")}/{public_path.lstrip("/")}'
    base_url = settings.storage_public_base_url.strip() or request_base_url
    return f'{base_url.rstrip("/")}{public_path}'


def avatar_url_for(public_path: str, request_base_url: str) -> str:
    """Return an avatar URL that remains valid when the web and API hosts differ."""
    if settings.storage_backend == 'local':
        return public_path
    return media_url_for(public_path, request_base_url)


async def check_storage() -> bool:
    if settings.storage_backend == 'local':
        try:
            storage_root().mkdir(parents=True, exist_ok=True)
            return True
        except OSError:
            return False
    try:
        await asyncio.to_thread(get_s3_client().head_bucket, Bucket=settings.s3_bucket)
        return True
    except (BotoCoreError, ClientError):
        return False


async def delete_storage_object(storage_key: str) -> None:
    """Delete a file created by this service, never an arbitrary host path or S3 key."""
    if settings.storage_backend == 'local':
        path = _local_path_for_storage_key(storage_key)
        try:
            await asyncio.to_thread(path.unlink, missing_ok=True)
        except OSError as exc:
            raise AuthError('File storage is temporarily unavailable') from exc
        return

    _validate_s3_object_key(storage_key)
    try:
        await asyncio.to_thread(
            get_s3_client().delete_object,
            Bucket=settings.s3_bucket,
            Key=storage_key,
        )
    except (BotoCoreError, ClientError) as exc:
        raise AuthError('File storage is temporarily unavailable') from exc


async def _upload_to_s3(path: Path, object_key: str, mime_type: str) -> None:
    try:
        await asyncio.to_thread(
            get_s3_client().upload_file,
            str(path),
            settings.s3_bucket,
            object_key,
            ExtraArgs={
                'ContentType': mime_type,
                'ContentDisposition': 'inline',
                'CacheControl': 'public, max-age=31536000, immutable',
            },
        )
    except (BotoCoreError, ClientError) as exc:
        raise AuthError('File storage is temporarily unavailable') from exc


def _s3_object_key(user_id: UUID, stored_name: str) -> str:
    prefix = settings.s3_prefix.strip('/')
    return '/'.join(part for part in (prefix, str(user_id), stored_name) if part)


def _local_path_for_storage_key(storage_key: str) -> Path:
    prefix = settings.storage_public_url_prefix.rstrip('/')
    if not prefix or not storage_key.startswith(f'{prefix}/'):
        raise AuthError('Unsupported storage object')
    return _path_from_key_parts(storage_key[len(prefix):].lstrip('/'), storage_root())


def _validate_s3_object_key(storage_key: str) -> None:
    prefix = settings.s3_prefix.strip('/')
    expected_prefix = f'{prefix}/' if prefix else ''
    if expected_prefix and not storage_key.startswith(expected_prefix):
        raise AuthError('Unsupported storage object')
    key_without_prefix = storage_key[len(expected_prefix):] if expected_prefix else storage_key
    _path_from_key_parts(key_without_prefix, None)


def _path_from_key_parts(value: str, root: Path | None) -> Path:
    parts = PurePosixPath(value).parts
    if len(parts) != 2 or any(part in {'', '.', '..'} for part in parts):
        raise AuthError('Unsupported storage object')
    try:
        UUID(parts[0])
    except ValueError as exc:
        raise AuthError('Unsupported storage object') from exc
    if Path(parts[1]).name != parts[1]:
        raise AuthError('Unsupported storage object')
    if root is None:
        return Path(value)

    resolved_root = root.resolve()
    parent = (resolved_root / parts[0]).resolve()
    if parent.parent != resolved_root:
        raise AuthError('Unsupported storage object')
    return parent / parts[1]


def _clean_filename(filename: str) -> str:
    cleaned = Path(filename).name.strip().replace('\x00', '')
    return cleaned[:255] or 'upload'


def _normalize_mime_type(mime_type: str | None) -> str:
    return (mime_type or 'application/octet-stream').split(';', 1)[0].strip().lower()


def _suggest_message_type(mime_type: str) -> str:
    if mime_type.startswith('image/'):
        return 'photo'
    if mime_type.startswith('video/'):
        return 'video'
    if mime_type.startswith('audio/'):
        return 'voice'
    return 'file'


def _validate_file_signature(mime_type: str, header: bytes) -> None:
    if not header:
        raise AuthError('Upload is empty')

    checks = {
        'image/jpeg': lambda value: value.startswith(b'\xff\xd8\xff'),
        'image/png': lambda value: value.startswith(b'\x89PNG\r\n\x1a\n'),
        'image/gif': lambda value: value.startswith((b'GIF87a', b'GIF89a')),
        'image/webp': lambda value: value.startswith(b'RIFF') and value[8:12] == b'WEBP',
        'video/mp4': _has_iso_base_media_signature,
        'video/quicktime': _has_iso_base_media_signature,
        'video/webm': lambda value: value.startswith(b'\x1a\x45\xdf\xa3'),
        'audio/webm': lambda value: value.startswith(b'\x1a\x45\xdf\xa3'),
        'audio/ogg': lambda value: value.startswith(b'OggS'),
        'audio/wav': lambda value: value.startswith(b'RIFF') and value[8:12] == b'WAVE',
        'audio/mpeg': lambda value: value.startswith(b'ID3') or (len(value) > 1 and value[0] == 0xFF and value[1] & 0xE0 == 0xE0),
        'audio/aac': lambda value: value.startswith(b'ADIF') or (len(value) > 1 and value[0] == 0xFF and value[1] & 0xF0 == 0xF0),
        'audio/mp4': _has_iso_base_media_signature,
        'application/pdf': lambda value: value.startswith(b'%PDF-'),
        'text/plain': lambda value: b'\x00' not in value,
    }
    checker = checks.get(mime_type)
    if checker and not checker(header):
        raise AuthError('Upload content does not match declared type')


def _has_iso_base_media_signature(header: bytes) -> bool:
    return len(header) >= 12 and header[4:8] == b'ftyp'
