import asyncio
import json
from urllib import request as urllib_request

from app.core.config import settings


async def send_telegram_message(chat_id: str, text: str, reply_markup: dict | None = None) -> None:
    await call_telegram_api('sendMessage', {
        'chat_id': chat_id,
        'text': text,
        **({'reply_markup': reply_markup} if reply_markup else {}),
    })


async def answer_telegram_callback(callback_query_id: str, text: str | None = None) -> None:
    await call_telegram_api('answerCallbackQuery', {
        'callback_query_id': callback_query_id,
        **({'text': text} if text else {}),
    })


async def call_telegram_api(method: str, payload: dict) -> None:
    if not settings.telegram_bot_token:
        return
    await asyncio.to_thread(_post_telegram_api, method, payload)


def _post_telegram_api(method: str, payload: dict) -> None:
    data = json.dumps(payload).encode('utf-8')
    url = f'https://api.telegram.org/bot{settings.telegram_bot_token}/{method}'
    request = urllib_request.Request(
        url,
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib_request.urlopen(request, timeout=10) as response:
        response.read()

