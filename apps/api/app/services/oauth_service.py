import asyncio
import base64
import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.oauth import OAuthAttempt, OAuthIdentity
from app.services.auth_service import AuthError, find_user_by_id, issue_session_for_user


OAuthProvider = Literal['vk', 'yandex']
OAUTH_ATTEMPT_TTL_MINUTES = 10


class OAuthError(ValueError):
    pass


@dataclass(frozen=True)
class OAuthStart:
    authorization_url: str


@dataclass(frozen=True)
class OAuthCompletion:
    status: str
    user_id: UUID | None = None
    device_id: str | None = None
    provider: str | None = None


async def start_oauth(
    session: AsyncSession,
    provider: OAuthProvider,
    device_id: str,
    flow: Literal['login', 'link'],
    user_id: UUID | None = None,
) -> OAuthStart:
    _validate_provider_configuration(provider)
    if flow == 'link' and user_id is None:
        raise OAuthError('An authenticated account is required to link a provider')
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = _code_challenge(verifier)
    attempt = OAuthAttempt(
        provider=provider,
        state_hash=_hash(state),
        code_verifier=verifier,
        flow=flow,
        user_id=user_id,
        device_id=device_id,
        status='pending',
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OAUTH_ATTEMPT_TTL_MINUTES),
    )
    session.add(attempt)
    await session.commit()
    return OAuthStart(_authorization_url(provider, state, challenge))


async def finish_oauth_callback(
    session: AsyncSession,
    provider: OAuthProvider,
    code: str | None,
    state: str | None,
    provider_device_id: str | None = None,
) -> str:
    if not code or not state:
        raise OAuthError('Provider did not return an authorization code')
    result = await session.execute(
        select(OAuthAttempt)
        .where(OAuthAttempt.provider == provider, OAuthAttempt.state_hash == _hash(state))
        .with_for_update()
    )
    attempt = result.scalar_one_or_none()
    if not attempt or attempt.status != 'pending' or attempt.expires_at <= datetime.now(timezone.utc):
        if attempt and attempt.status == 'pending':
            attempt.status = 'expired'
            await session.commit()
        raise OAuthError('OAuth authorization has expired or is invalid')

    try:
        subject = await _exchange_code_and_get_subject(provider, code, state, attempt.code_verifier, provider_device_id)
    except OAuthError:
        attempt.status = 'failed'
        await session.commit()
        raise

    attempt.provider_device_id = provider_device_id
    now = datetime.now(timezone.utc)
    existing = await session.scalar(
        select(OAuthIdentity).where(
            OAuthIdentity.provider == provider,
            OAuthIdentity.provider_subject == subject,
        )
    )
    if attempt.flow == 'link':
        if existing and existing.user_id != attempt.user_id:
            attempt.status = 'failed'
            await session.commit()
            raise OAuthError('This external account is already linked to another AraChat account')
        if not existing:
            session.add(OAuthIdentity(user_id=attempt.user_id, provider=provider, provider_subject=subject))
        attempt.result_user_id = attempt.user_id
        attempt.status = 'linked'
    else:
        if not existing:
            attempt.status = 'unlinked'
            await session.commit()
            raise OAuthError('This external account is not linked. Sign in with e-mail and link it in settings first')
        existing.last_used_at = now
        attempt.result_user_id = existing.user_id
        attempt.status = 'authenticated'

    result_token = secrets.token_urlsafe(32)
    attempt.result_token_hash = _hash(result_token)
    attempt.completed_at = now
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise OAuthError('This external account is already linked to another AraChat account') from exc
    return result_token


async def consume_oauth_result(
    session: AsyncSession,
    result_token: str,
    expected_user_id: UUID | None = None,
    expected_device_id: str | None = None,
    expected_status: Literal['authenticated', 'linked'] | None = None,
) -> OAuthCompletion:
    result = await session.execute(
        select(OAuthAttempt)
        .where(OAuthAttempt.result_token_hash == _hash(result_token))
        .with_for_update()
    )
    attempt = result.scalar_one_or_none()
    if (
        not attempt
        or attempt.consumed_at
        or attempt.expires_at <= datetime.now(timezone.utc)
        or attempt.status not in {'authenticated', 'linked'}
        or (expected_status is not None and attempt.status != expected_status)
        or not attempt.result_user_id
        or (expected_user_id is not None and attempt.user_id != expected_user_id)
        or (expected_device_id is not None and attempt.device_id != expected_device_id)
    ):
        raise OAuthError('OAuth result has expired or is invalid')
    attempt.consumed_at = datetime.now(timezone.utc)
    status = attempt.status
    user_id = attempt.result_user_id
    device_id = attempt.device_id
    provider = attempt.provider
    await session.commit()
    return OAuthCompletion(status=status, user_id=user_id, device_id=device_id, provider=provider)


async def oauth_login_result(session: AsyncSession, result_token: str, device_id: str):
    completion = await consume_oauth_result(
        session,
        result_token,
        expected_device_id=device_id,
        expected_status='authenticated',
    )
    if completion.status != 'authenticated' or not completion.user_id or not completion.device_id or not completion.provider:
        raise OAuthError('OAuth result is not a sign-in')
    user = await find_user_by_id(session, completion.user_id)
    if not user:
        raise OAuthError('Account not found')
    try:
        return await issue_session_for_user(session, user, completion.device_id, f'{completion.provider}_id')
    except AuthError as exc:
        raise OAuthError(str(exc)) from exc


async def oauth_link_result(
    session: AsyncSession,
    result_token: str,
    user_id: UUID,
    device_id: str,
) -> OAuthCompletion:
    completion = await consume_oauth_result(
        session,
        result_token,
        expected_user_id=user_id,
        expected_device_id=device_id,
        expected_status='linked',
    )
    if completion.status != 'linked':
        raise OAuthError('OAuth result is not a provider link')
    return completion


def callback_redirect_url(result_token: str | None = None, error: str | None = None) -> str:
    base_url = _public_base_url()
    query = urlencode({'result': result_token} if result_token else {'error': error or 'oauth_failed'})
    # A one-time AraChat result, not a provider token, is kept in the fragment
    # so browsers do not send it in Referer headers while loading the callback.
    return f'{base_url}/login/oauth/callback#{query}'


def _validate_provider_configuration(provider: OAuthProvider) -> None:
    _public_base_url()
    values = {
        'yandex': (settings.yandex_oauth_client_id, settings.yandex_oauth_client_secret),
        'vk': (settings.vk_oauth_client_id, settings.vk_oauth_service_token),
    }
    if provider not in values:
        raise OAuthError('Unsupported OAuth provider')
    client_id, client_secret = values[provider]
    if not client_id.strip() or not client_secret.strip():
        raise OAuthError(f'{provider} OAuth is not configured')


def _authorization_url(provider: OAuthProvider, state: str, challenge: str) -> str:
    redirect_uri = _redirect_uri(provider)
    if provider == 'yandex':
        query = {
            'response_type': 'code',
            'client_id': settings.yandex_oauth_client_id,
            'redirect_uri': redirect_uri,
            'state': state,
            'code_challenge': challenge,
            'code_challenge_method': 'S256',
        }
        return f'https://oauth.yandex.com/authorize?{urlencode(query)}'
    query = {
        'response_type': 'code',
        'client_id': settings.vk_oauth_client_id,
        'redirect_uri': redirect_uri,
        'state': state,
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
    }
    return f'https://id.vk.ru/authorize?{urlencode(query)}'


async def _exchange_code_and_get_subject(
    provider: OAuthProvider,
    code: str,
    state: str,
    verifier: str,
    provider_device_id: str | None,
) -> str:
    if provider == 'yandex':
        token_payload = await _post_form(
            'https://oauth.yandex.com/token',
            {
                'grant_type': 'authorization_code',
                'code': code,
                'client_id': settings.yandex_oauth_client_id,
                'client_secret': settings.yandex_oauth_client_secret,
                'redirect_uri': _redirect_uri(provider),
                'code_verifier': verifier,
            },
        )
        access_token = _required_value(token_payload, 'access_token')
        profile = await _get_json('https://login.yandex.ru/info?format=json', {'Authorization': f'OAuth {access_token}'})
        return _required_value(profile, 'id')

    if not provider_device_id:
        raise OAuthError('VK ID did not return a device identifier')
    token_payload = await _post_form(
        'https://id.vk.ru/oauth2/auth',
        {
            'grant_type': 'authorization_code',
            'client_id': settings.vk_oauth_client_id,
            'redirect_uri': _redirect_uri(provider),
            'code_verifier': verifier,
            'device_id': provider_device_id,
            'state': state,
            'code': code,
            'service_token': settings.vk_oauth_service_token,
        },
    )
    if token_payload.get('state') is not None and not secrets.compare_digest(str(token_payload['state']), state):
        raise OAuthError('OAuth provider returned invalid state')
    access_token = _required_value(token_payload, 'access_token')
    profile = await _post_form(
        'https://id.vk.ru/oauth2/user_info',
        {
            'client_id': settings.vk_oauth_client_id,
            'access_token': access_token,
        },
    )
    return _required_value(profile.get('user') if isinstance(profile.get('user'), dict) else profile, 'user_id')


async def _post_form(url: str, payload: dict[str, str]) -> dict:
    body = urlencode(payload).encode()
    return await asyncio.to_thread(_request_json, url, body, {'Content-Type': 'application/x-www-form-urlencoded'})


async def _get_json(url: str, headers: dict[str, str]) -> dict:
    return await asyncio.to_thread(_request_json, url, None, headers)


def _request_json(url: str, body: bytes | None, headers: dict[str, str]) -> dict:
    request = Request(url, data=body, headers=headers, method='POST' if body is not None else 'GET')
    try:
        with urlopen(request, timeout=settings.smtp_timeout_seconds) as response:  # nosec B310 -- URLs are fixed provider endpoints.
            payload = json.loads(response.read().decode())
    except (HTTPError, URLError, OSError, ValueError) as exc:
        raise OAuthError('OAuth provider could not complete authorization') from exc
    if not isinstance(payload, dict) or payload.get('error'):
        raise OAuthError('OAuth provider rejected authorization')
    return payload


def _required_value(payload: dict, key: str) -> str:
    value = payload.get(key)
    if value is None or not str(value):
        raise OAuthError('OAuth provider returned incomplete account data')
    return str(value)


def _redirect_uri(provider: OAuthProvider) -> str:
    return f'{_public_base_url()}/api/auth/oauth/{provider}/callback'


def _public_base_url() -> str:
    value = settings.public_base_url.strip().rstrip('/')
    if not value:
        raise OAuthError('Public base URL is not configured for OAuth')
    if not value.startswith('https://') and not (settings.environment == 'dev' and value.startswith('http://localhost')):
        raise OAuthError('OAuth requires an HTTPS public base URL')
    return value


def _code_challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()
