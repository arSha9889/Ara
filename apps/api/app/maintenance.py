import asyncio

from app.db.session import AsyncSessionLocal
from app.services.retention_service import RetentionError, run_retention


async def main() -> None:
    async with AsyncSessionLocal() as session:
        try:
            result = await run_retention(session)
        except RetentionError as exc:
            raise SystemExit(str(exc)) from exc
    print(f"Retention complete: {result['deleted']}")


if __name__ == '__main__':
    asyncio.run(main())
