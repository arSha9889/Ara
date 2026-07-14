import secrets
import string

from app.core.config import settings

RECOVERY_ALPHABET = ''.join(ch for ch in string.ascii_uppercase + string.digits if ch not in 'O0I1')


def generate_recovery_code() -> str:
    return ''.join(secrets.choice(RECOVERY_ALPHABET) for _ in range(settings.recovery_code_length))


def is_valid_recovery_code(value: str) -> bool:
    normalized = value.replace(' ', '').replace('-', '').upper()
    return len(normalized) == settings.recovery_code_length and all(ch in RECOVERY_ALPHABET for ch in normalized)


def format_recovery_code(value: str) -> str:
    normalized = value.replace(' ', '').replace('-', '').upper()
    if not is_valid_recovery_code(normalized):
        raise ValueError('Recovery code must contain 24 allowed characters')
    return ' '.join(normalized[index:index + 4] for index in range(0, len(normalized), 4))
