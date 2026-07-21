from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.domain.registration_proof import create_registration_proof, verify_registration_proof
from app.domain.tokens import create_access_token, decode_access_token
from app.models.verification import PhoneVerification
from app.services.phone_verification_service import (
    handle_telegram_bot_update,
    normalize_phone,
    verify_phone_code,
)


def test_registration_proof_roundtrip() -> None:
    proof = create_registration_proof('123456')

    assert verify_registration_proof(proof) == '123456'


def test_access_token_roundtrip() -> None:
    user_id = uuid4()
    token = create_access_token(user_id)

    assert decode_access_token(token) == user_id


def test_normalize_phone() -> None:
    assert normalize_phone('8 (999) 123-45-67') == '+79991234567'
    assert normalize_phone('+1 555 123 4567') == '+15551234567'
    assert normalize_phone('9991234567', 'RU') == '+79991234567'
    assert normalize_phone('7011234567', 'KZ') == '+77011234567'
    assert normalize_phone('+380 67 123 45 67', 'UA') == '+380671234567'
    assert normalize_phone('067 123 45 67', 'UA') == '+380671234567'
    assert normalize_phone('671234567', 'UA') == '+380671234567'
    with pytest.raises(ValueError):
        normalize_phone('+1 555 123 4567', 'RU')
    with pytest.raises(ValueError):
        normalize_phone('+7 999 123 45 67', 'KZ')
    with pytest.raises(ValueError):
        normalize_phone('+380 44 123 45 67', 'UA')


@pytest.mark.anyio
async def test_registration_limit_blocks_new_accounts(anyio_backend) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.base import Base
    from app.domain.registration_proof import create_registration_proof
    from app.models.users import User
    from app.schemas.auth import RegisterCompleteRequest
    from app.services.auth_service import AuthError, complete_registration

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            for index in range(100):
                session.add(User(nexus_id=f'{index:016d}', telegram_id=f'existing-{index}', status='active'))
            await session.commit()

            with pytest.raises(AuthError, match='Early access registration limit is reached'):
                await complete_registration(
                    session,
                    RegisterCompleteRequest(
                        registration_proof=create_registration_proof('dev-over-limit'),
                        username='overlimit',
                        password='password123',
                        device_id='device-over-limit',
                        accepted_terms=True,
                        accepted_privacy_policy=True,
                    ),
                )
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_phone_verification_bot_flow(anyio_backend, monkeypatch) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.base import Base

    if anyio_backend != 'asyncio':
        pytest.skip('asyncio only')
    pytest.importorskip('aiosqlite')

    sent_messages = []

    async def fake_send_telegram_message(chat_id, text, reply_markup=None):
        sent_messages.append((chat_id, text, reply_markup))

    async def fake_answer_telegram_callback(callback_query_id, text=None):
        sent_messages.append((callback_query_id, text, None))

    monkeypatch.setattr('app.services.phone_verification_service.send_telegram_message', fake_send_telegram_message)
    monkeypatch.setattr('app.services.phone_verification_service.answer_telegram_callback', fake_answer_telegram_callback)

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as session:
            verification = PhoneVerification(
                public_token='token123',
                phone_country='RU',
                phone='+79991234567',
                device_id='device-123456',
                status='pending',
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
            session.add(verification)
            await session.commit()
            await session.refresh(verification)

            await handle_telegram_bot_update(session, {
                'message': {
                    'text': '/start phone_token123',
                    'chat': {'id': 1001},
                    'from': {'id': 42, 'username': 'nexus'},
                },
            })
            await handle_telegram_bot_update(session, {
                'callback_query': {
                    'id': 'callback-1',
                    'data': 'phone_confirm:token123',
                    'from': {'id': 42},
                    'message': {'chat': {'id': 1001}},
                },
            })

            code_message = next(text for _, text, _ in sent_messages if 'Ваш код подтверждения Nexus:' in text)
            code = code_message.split(': ')[1][:4]
            result = await verify_phone_code(session, verification.id, code)

            assert verify_registration_proof(result.registration_proof) == '42'
            assert result.verification.status == 'verified'
    finally:
        await engine.dispose()
