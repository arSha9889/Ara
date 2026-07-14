from app.domain.nexus_id import format_nexus_id, generate_nexus_id, is_valid_nexus_id
from app.domain.recovery_code import format_recovery_code, generate_recovery_code, is_valid_recovery_code
from app.domain.security_hashing import hash_secret, verify_secret
from app.domain.validators import is_valid_password, is_valid_pin, is_valid_username


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


def test_recovery_code_generation_and_formatting() -> None:
    code = generate_recovery_code()

    assert is_valid_recovery_code(code)
    assert len(code) == 24
    assert format_recovery_code(code).count(' ') == 5


def test_secret_hashing_roundtrip() -> None:
    secret_hash = hash_secret('Password123')

    assert verify_secret('Password123', secret_hash)
    assert not verify_secret('WrongPassword123', secret_hash)
