from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

password_hasher = PasswordHasher(
    time_cost=settings.password_hash_time_cost,
    memory_cost=settings.password_hash_memory_cost,
    parallelism=settings.password_hash_parallelism,
)


def hash_secret(secret: str) -> str:
    return password_hasher.hash(secret)


def verify_secret(secret: str, secret_hash: str) -> bool:
    try:
        return password_hasher.verify(secret_hash, secret)
    except VerifyMismatchError:
        return False
