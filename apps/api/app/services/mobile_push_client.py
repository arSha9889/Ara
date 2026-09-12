import asyncio
import json
import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import service_account

from app.core.config import settings


logger = logging.getLogger(__name__)

UNIVERSAL_PUSH_URL = 'https://vkpns-universal.rustore.ru/v1/send'
FCM_MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
MobilePushProvider = Literal['rustore', 'fcm']


@dataclass(frozen=True)
class MobilePushDeliveryResult:
    delivered: bool
    invalid_token_prefixes: dict[MobilePushProvider, frozenset[str]]


_fcm_token_lock = threading.Lock()
_fcm_access_token: str | None = None
_fcm_access_token_expires_at: datetime | None = None
_fcm_service_account_file: str | None = None


def mobile_push_is_configured() -> bool:
    return settings.mobile_push_enabled and bool(_configured_providers())


async def send_mobile_push(
    tokens_by_provider: dict[MobilePushProvider, list[str]],
    data: dict[str, str],
) -> MobilePushDeliveryResult:
    providers = _configured_providers()
    tokens = {
        provider: provider_tokens
        for provider, provider_tokens in tokens_by_provider.items()
        if provider in providers and provider_tokens
    }
    if not settings.mobile_push_enabled or not tokens:
        return MobilePushDeliveryResult(delivered=False, invalid_token_prefixes={})

    try:
        if 'fcm' in tokens:
            providers['fcm']['auth_token'] = await _get_fcm_access_token()
        payload = {
            'providers': {provider: providers[provider] for provider in tokens},
            'tokens': tokens,
            'message': {'data': data},
        }
        return await asyncio.to_thread(_send_request, payload, tokens)
    except Exception as exc:
        logger.warning('Mobile Push delivery failed: %s', type(exc).__name__)
        return MobilePushDeliveryResult(delivered=False, invalid_token_prefixes={})


def _configured_providers() -> dict[MobilePushProvider, dict[str, str]]:
    providers: dict[MobilePushProvider, dict[str, str]] = {}
    rustore_project_id = settings.rustore_push_project_id.strip()
    rustore_service_token = settings.rustore_push_service_token.strip()
    if rustore_project_id and rustore_service_token:
        providers['rustore'] = {
            'project_id': rustore_project_id,
            'auth_token': rustore_service_token,
        }

    fcm_project_id = settings.fcm_push_project_id.strip()
    fcm_service_account_file = settings.fcm_service_account_file.strip()
    if fcm_project_id and fcm_service_account_file and Path(fcm_service_account_file).is_file():
        providers['fcm'] = {'project_id': fcm_project_id, 'auth_token': ''}
    return providers


async def _get_fcm_access_token() -> str:
    return await asyncio.to_thread(_load_fcm_access_token)


def _load_fcm_access_token() -> str:
    global _fcm_access_token, _fcm_access_token_expires_at, _fcm_service_account_file

    service_account_file = settings.fcm_service_account_file.strip()
    with _fcm_token_lock:
        now = datetime.now(timezone.utc)
        if (
            _fcm_access_token
            and _fcm_access_token_expires_at
            and _fcm_access_token_expires_at > now + timedelta(minutes=5)
            and _fcm_service_account_file == service_account_file
        ):
            return _fcm_access_token

        credentials = service_account.Credentials.from_service_account_file(
            service_account_file,
            scopes=[FCM_MESSAGING_SCOPE],
        )
        credentials.refresh(GoogleRequest())
        if not credentials.token:
            raise RuntimeError('FCM credentials did not return an access token')

        expiry = credentials.expiry
        if expiry is None:
            raise RuntimeError('FCM credentials did not return an expiry time')
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)

        _fcm_access_token = credentials.token
        _fcm_access_token_expires_at = expiry.astimezone(timezone.utc)
        _fcm_service_account_file = service_account_file
        return _fcm_access_token


def _send_request(
    payload: dict[str, object],
    tokens_by_provider: dict[MobilePushProvider, list[str]],
) -> MobilePushDeliveryResult:
    request = Request(
        UNIVERSAL_PUSH_URL,
        data=json.dumps(payload, separators=(',', ':')).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
        method='POST',
    )
    try:
        with urlopen(request, timeout=settings.mobile_push_timeout_seconds) as response:
            body = response.read()
    except HTTPError as exc:
        return _result_from_error_response(exc, tokens_by_provider)
    except (OSError, URLError) as exc:
        logger.warning('Mobile Push transport failed: %s', type(exc).__name__)
        return MobilePushDeliveryResult(delivered=False, invalid_token_prefixes={})

    try:
        result = json.loads(body) if body else {}
    except json.JSONDecodeError:
        logger.warning('Mobile Push returned an invalid response')
        return MobilePushDeliveryResult(delivered=False, invalid_token_prefixes={})
    if isinstance(result, dict) and result.get('status') not in {None, 'OK'}:
        logger.warning('Mobile Push returned a non-success status')
        return MobilePushDeliveryResult(delivered=False, invalid_token_prefixes={})
    return MobilePushDeliveryResult(delivered=True, invalid_token_prefixes={})


def _result_from_error_response(
    error: HTTPError,
    tokens_by_provider: dict[MobilePushProvider, list[str]],
) -> MobilePushDeliveryResult:
    try:
        body = error.read()
        payload = json.loads(body) if body else {}
    except (OSError, json.JSONDecodeError):
        payload = {}

    prefixes = _invalid_token_prefixes(payload, tokens_by_provider)
    logger.warning('Mobile Push request was rejected: status=%s', error.code)
    return MobilePushDeliveryResult(delivered=False, invalid_token_prefixes=prefixes)


def _invalid_token_prefixes(
    payload: object,
    tokens_by_provider: dict[MobilePushProvider, list[str]],
) -> dict[MobilePushProvider, frozenset[str]]:
    if not isinstance(payload, dict):
        return {}
    errors = payload.get('errors')
    if not isinstance(errors, list):
        return {}

    prefixes: dict[MobilePushProvider, set[str]] = {}
    for error in errors:
        if not isinstance(error, str):
            continue
        normalized_error = error.casefold()
        if 'invalid token' not in normalized_error:
            continue
        for provider, tokens in tokens_by_provider.items():
            if not normalized_error.startswith(f'{provider}:'):
                continue
            for token in tokens:
                prefix = token[:6]
                if prefix and prefix.casefold() in normalized_error:
                    prefixes.setdefault(provider, set()).add(prefix)
    return {provider: frozenset(values) for provider, values in prefixes.items()}
