import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings
from app.services.localization import email_message_content, tr


class SmtpDeliveryError(RuntimeError):
    pass


async def send_verification_code(email: str, code: str, purpose: str, expires_in_minutes: int, language: str = 'ru') -> None:
    if not settings.smtp_is_configured:
        raise SmtpDeliveryError('SMTP e-mail delivery is not configured')

    subject, heading, description = email_message_content(language, purpose)
    message = EmailMessage()
    message['Subject'] = subject
    message['From'] = _from_header()
    message['To'] = email
    message.set_content(
        f'{heading}\n\n'
        f'{description}\n\n'
        f'{tr(language, "email.code", code=code)}\n\n'
        f'{tr(language, "email.safety", minutes=expires_in_minutes)}'
    )
    try:
        await asyncio.to_thread(_send_message, message)
    except (OSError, smtplib.SMTPException) as exc:
        raise SmtpDeliveryError('Could not deliver verification e-mail') from exc


def _send_message(message: EmailMessage) -> None:
    timeout = settings.smtp_timeout_seconds
    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=timeout,
            context=ssl.create_default_context(),
        ) as client:
            _authenticate_and_send(client, message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout) as client:
        client.ehlo()
        if settings.smtp_use_starttls:
            client.starttls(context=ssl.create_default_context())
            client.ehlo()
        _authenticate_and_send(client, message)


def _authenticate_and_send(client: smtplib.SMTP, message: EmailMessage) -> None:
    if settings.smtp_username:
        client.login(settings.smtp_username, settings.smtp_password)
    client.send_message(message)


def _from_header() -> str:
    name = settings.smtp_from_name.strip()
    return f'{name} <{settings.smtp_from_email}>' if name else settings.smtp_from_email
