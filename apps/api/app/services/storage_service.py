from dataclasses import dataclass
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.core.config import settings
from app.services.auth_service import AuthError

API_ROOT = Path(__file__).resolve().parents[2]
CHUNK_SIZE = 1024 * 1024
AVATAR_MAX_SIZE_BYTES = 50 * 1024 * 1024

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


async def save_upload_file(upload: UploadFile, user_id: UUID, max_size_bytes: int | None = None) -> StoredUpload:
    mime_type = _normalize_mime_type(upload.content_type)
    if mime_type not in ALLOWED_MIME_TYPES:
        raise AuthError('Unsupported upload type')

    original_name = _clean_filename(upload.filename or 'upload')
    extension = EXTENSIONS_BY_MIME_TYPE[mime_type]
    relative_dir = Path(str(user_id))
    target_dir = storage_root() / relative_dir
    target_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f'{uuid4().hex}{extension}'
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
    except Exception:
        target_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    public_prefix = settings.storage_public_url_prefix.rstrip('/')
    return StoredUpload(
        public_path=f'{public_prefix}/{user_id}/{stored_name}',
        original_name=original_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
        suggested_message_type=_suggest_message_type(mime_type),
    )


def media_url_for(public_path: str, request_base_url: str) -> str:
    base_url = settings.storage_public_base_url.strip() or request_base_url
    return f'{base_url.rstrip("/")}{public_path}'


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
