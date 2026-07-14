import secrets

from app.core.config import settings


def generate_nexus_id() -> str:
    first_digit = secrets.choice('123456789')
    rest = ''.join(secrets.choice('0123456789') for _ in range(settings.nexus_id_length - 1))
    return f'{first_digit}{rest}'


def is_valid_nexus_id(value: str) -> bool:
    return value.isdigit() and len(value) == settings.nexus_id_length


def format_nexus_id(value: str) -> str:
    if not is_valid_nexus_id(value):
        raise ValueError('Nexus ID must contain exactly 16 digits')
    return ' '.join(value[index:index + 4] for index in range(0, len(value), 4))
