from uuid import uuid4

import pytest

from app.domain.nexus_id import format_nexus_id, generate_nexus_id, is_valid_nexus_id
from app.domain.security_hashing import hash_secret, verify_secret
from app.domain.validators import is_valid_password, is_valid_pin, is_valid_username
from app.models.users import User, UserProfile
from app.schemas.chats import MessageCreateRequest
from app.services.auth_service import AuthError
from app.services.chat_service import STICKER_IDS, _validate_message_request
from app.services.user_service import to_public_user_out


def test_generate_nexus_id_returns_16_digits() -> None:
    nexus_id = generate_nexus_id()

    assert is_valid_nexus_id(nexus_id)
    assert format_nexus_id(nexus_id).count(' ') == 3


def test_username_rules() -> None:
    assert is_valid_username('User123')
    assert is_valid_username('abc')
    assert not is_valid_username('ab')
    assert not is_valid_username('user_name')
    assert not is_valid_username('юзер')


def test_password_rules() -> None:
    assert is_valid_password('abc12')
    assert is_valid_password('Password123')
    assert not is_valid_password('abcd')
    assert not is_valid_password('pass word')
    assert not is_valid_password('password!')


def test_pin_rules() -> None:
    assert is_valid_pin('1234')
    assert is_valid_pin('12345678')
    assert not is_valid_pin('123')
    assert not is_valid_pin('123456789')
    assert not is_valid_pin('12a4')


def test_secret_hashing_roundtrip() -> None:
    secret_hash = hash_secret('Password123')

    assert verify_secret('Password123', secret_hash)
    assert not verify_secret('WrongPassword123', secret_hash)


def test_sticker_message_accepts_only_known_stickers_without_media() -> None:
    assert STICKER_IDS == {
        'ara-alt', 'ara-solidity', 'ara-school-holiday', 'ara-aksakal-approves',
        'ara-sigma', 'ara-our-elephant', 'ara-civilization', 'ara-sakhavud',
        'ara-salam-relatives', 'ara-rahmet', 'ara-tea',
    }
    sticker_id = 'ara-rahmet'

    _validate_message_request(MessageCreateRequest(type='sticker', text=sticker_id))

    with pytest.raises(AuthError, match='Unsupported sticker'):
        _validate_message_request(MessageCreateRequest(type='sticker', text='external-sticker'))
    with pytest.raises(AuthError, match='Sticker messages cannot contain media'):
        _validate_message_request(MessageCreateRequest(type='sticker', text=sticker_id, media_url='https://example.test/sticker.svg'))


def test_public_user_output_exposes_only_allowed_profile_data() -> None:
    user = User(id=uuid4(), nexus_id='1234567890123456', telegram_id='telegram-private-id')
    user.profile = UserProfile(
        user_id=user.id,
        display_name='Private User',
        username='privateuser',
        avatar_type='built_in',
        avatar_ref='animal-01',
        optional_phone='+79990000000',
        email='private@example.com',
        registration_country='RU',
        phone_public=False,
        language='ru',
        design_theme='halo',
        current_mode='regular',
    )

    private_data = to_public_user_out(user).model_dump()

    assert private_data['profile']['optional_phone'] is None
    assert set(private_data) == {'id', 'is_official', 'profile'}
    assert set(private_data['profile']) == {'display_name', 'username', 'avatar_type', 'avatar_ref', 'optional_phone'}

    user.profile.phone_public = True

    assert to_public_user_out(user).profile.optional_phone == '+79990000000'
