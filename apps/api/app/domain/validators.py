import re

USERNAME_PATTERN = re.compile(r'^[A-Za-z0-9]{3,32}$')
PASSWORD_PATTERN = re.compile(r'^[A-Za-z0-9]{5,30}$')
PIN_PATTERN = re.compile(r'^\d{4,8}$')


def is_valid_username(value: str) -> bool:
    return bool(USERNAME_PATTERN.fullmatch(value))


def is_valid_password(value: str) -> bool:
    return bool(PASSWORD_PATTERN.fullmatch(value))


def is_valid_pin(value: str) -> bool:
    return bool(PIN_PATTERN.fullmatch(value))
