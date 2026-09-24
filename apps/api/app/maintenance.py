import asyncio

from app.db.session import AsyncSessionLocal
from app.services.project_news_service import publish_due_project_news
from app.services.retention_service import RetentionError, run_retention
from app.services.system_bot_service import publish_due_system_announcements
from app.services.user_access_service import expire_user_restrictions


async def main() -> None:
    async with AsyncSessionLocal() as session:
        try:
            result = await run_retention(session)
        except RetentionError as exc:
            raise SystemExit(str(exc)) from exc
    print(f"Retention complete: {result['deleted']}")


async def run_scheduled_tasks() -> None:
    async with AsyncSessionLocal() as session:
        restored_restrictions = await expire_user_restrictions(session)
        published_announcements = await publish_due_system_announcements(session)
        published_news = await publish_due_project_news(session)
    print(f"Scheduled tasks complete: restrictions={restored_restrictions}, announcements={published_announcements}, news={published_news}")


if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == 'scheduled':
        asyncio.run(run_scheduled_tasks())
    else:
        asyncio.run(main())
