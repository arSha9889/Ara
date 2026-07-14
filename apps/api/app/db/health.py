from sqlalchemy import text

from app.db.session import AsyncSessionLocal


async def check_database() -> bool:
    async with AsyncSessionLocal() as session:
        await session.execute(text('SELECT 1'))
    return True
