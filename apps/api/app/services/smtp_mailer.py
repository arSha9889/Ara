import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings


class SmtpDeliveryError(RuntimeError):
    pass


async def send_verification_code(email: str, code: str, purpose: str, expires_in_minutes: int) -> None:
    if not settings.smtp_is_configured:
        raise SmtpDeliveryError('SMTP e-mail delivery is not configured')

    subject, heading, description = _message_content(purpose)
    message = EmailMessage()
    message['Subject'] = subject
    message['From'] = _from_header()
    message['To'] = email
    message.set_content(
        f'{heading}\n\n'
        f'{description}\n\n'
        f'Код: {code}\n\n'
        f'Он действует {expires_in_minutes} мин. Никому не сообщайте этот код. '
        'Если запрос сделали не вы, просто проигнорируйте это письмо.'
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


def _message_content(purpose: str) -> tuple[str, str, str]:
    messages = {
        'registration': ('Код подтверждения e-mail — AraChat', 'Подтвердите e-mail', 'Введите этот код, чтобы завершить регистрацию в AraChat.'),
        'password_change': ('Код смены пароля — AraChat', 'Подтвердите смену пароля', 'Введите этот код, чтобы изменить пароль AraChat.'),
        'password_reset': ('Код восстановления доступа — AraChat', 'Восстановление доступа', 'Введите этот код, чтобы задать новый пароль AraChat.'),
        'email_change': ('Код смены e-mail — AraChat', 'Подтвердите новый e-mail', 'Введите этот код, чтобы привязать этот e-mail к AraChat.'),
    }
    return messages.get(purpose, ('Код подтверждения — AraChat', 'Подтвердите действие', 'Введите этот код в AraChat.'))
