from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from starlette.datastructures import Headers

from fastapi import UploadFile

from app.core.config import settings
from app.services.auth_service import AuthError
from app.services import storage_service
from app.services.storage_service import avatar_url_for, delete_storage_object, media_url_for, save_upload_file


WEBM_BYTES = b'\x1a\x45\xdf\xa3webm-data'
PNG_BYTES = b'\x89PNG\r\n\x1a\nimage-data'


def _upload(filename: str, content_type: str, content: bytes) -> UploadFile:
    return UploadFile(
        file=BytesIO(content),
        filename=filename,
        headers=Headers({'content-type': content_type}),
    )


@pytest.mark.anyio
async def test_save_upload_file_stores_audio_with_normalized_mime_type(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, 'upload_dir', str(tmp_path))
    monkeypatch.setattr(settings, 'upload_max_size_bytes', 1024)
    monkeypatch.setattr(settings, 'storage_public_url_prefix', '/storage/uploads')
    monkeypatch.setattr(settings, 'storage_public_base_url', '')
    user_id = uuid4()

    stored = await save_upload_file(_upload('../voice.webm', 'audio/webm;codecs=opus', WEBM_BYTES), user_id)

    assert stored.original_name == 'voice.webm'
    assert stored.mime_type == 'audio/webm'
    assert stored.size_bytes == len(WEBM_BYTES)
    assert stored.suggested_message_type == 'voice'
    assert stored.public_path.startswith(f'/storage/uploads/{user_id}/')
    assert (tmp_path / str(user_id) / stored.public_path.rsplit('/', 1)[-1]).exists()
    assert media_url_for(stored.public_path, 'http://api.local/') == f'http://api.local{stored.public_path}'
    assert avatar_url_for(stored.public_path, 'http://api.local/') == stored.public_path


@pytest.mark.anyio
async def test_save_upload_file_rejects_too_large_file(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, 'upload_dir', str(tmp_path))
    monkeypatch.setattr(settings, 'upload_max_size_bytes', 3)

    with pytest.raises(AuthError, match='Upload is too large'):
        await save_upload_file(_upload('photo.png', 'image/png', PNG_BYTES), uuid4())

    assert not list(tmp_path.rglob('*.*'))


@pytest.mark.anyio
async def test_save_upload_file_rejects_content_type_spoofing(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, 'upload_dir', str(tmp_path))
    monkeypatch.setattr(settings, 'upload_max_size_bytes', 1024)

    with pytest.raises(AuthError, match='does not match declared type'):
        await save_upload_file(_upload('photo.png', 'image/png', b'MZ-not-a-real-png'), uuid4())

    assert not list(tmp_path.rglob('*.*'))


@pytest.mark.anyio
async def test_save_upload_file_uploads_validated_content_to_s3(tmp_path, monkeypatch) -> None:
    uploaded: dict[str, object] = {}

    class S3Client:
        def upload_file(self, filename: str, bucket: str, key: str, ExtraArgs: dict) -> None:
            uploaded.update({
                'content': Path(filename).read_bytes(),
                'bucket': bucket,
                'key': key,
                'extra_args': ExtraArgs,
            })

    monkeypatch.setattr(settings, 'storage_backend', 's3')
    monkeypatch.setattr(settings, 's3_bucket', 'arachat-media')
    monkeypatch.setattr(settings, 's3_prefix', 'production-media')
    monkeypatch.setattr(settings, 's3_public_base_url', 'https://media.example.test')
    monkeypatch.setattr(storage_service, 'get_s3_client', lambda: S3Client())
    user_id = uuid4()

    stored = await save_upload_file(_upload('avatar.png', 'image/png', PNG_BYTES), user_id)

    assert uploaded['content'] == PNG_BYTES
    assert uploaded['bucket'] == 'arachat-media'
    assert uploaded['key'].startswith(f'production-media/{user_id}/')
    assert uploaded['extra_args'] == {
        'ContentType': 'image/png',
        'ContentDisposition': 'inline',
        'CacheControl': 'public, max-age=31536000, immutable',
    }
    assert stored.public_path == uploaded['key']
    assert media_url_for(stored.public_path, 'http://api.local/') == f'https://media.example.test/{stored.public_path}'
    assert avatar_url_for(stored.public_path, 'http://api.local/') == f'https://media.example.test/{stored.public_path}'


@pytest.mark.anyio
async def test_delete_storage_object_removes_only_a_registered_local_key(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, 'storage_backend', 'local')
    monkeypatch.setattr(settings, 'upload_dir', str(tmp_path))
    monkeypatch.setattr(settings, 'storage_public_url_prefix', '/storage/uploads')
    user_id = uuid4()
    stored = await save_upload_file(_upload('photo.png', 'image/png', PNG_BYTES), user_id)
    stored_file = tmp_path / str(user_id) / stored.public_path.rsplit('/', 1)[-1]
    protected_file = tmp_path / 'protected.txt'
    protected_file.write_text('keep')

    await delete_storage_object(stored.public_path)

    assert not stored_file.exists()
    assert protected_file.read_text() == 'keep'
    with pytest.raises(AuthError, match='Unsupported storage object'):
        await delete_storage_object('/storage/uploads/../../protected.txt')
    assert protected_file.read_text() == 'keep'
