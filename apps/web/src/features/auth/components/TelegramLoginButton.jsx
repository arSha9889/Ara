import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { apiRequest } from '../../../shared/api/httpClient.js';
import { getRuntimeConfigValue } from '../../../shared/config/runtimeConfig.js';
import { createEarlyAccessRegistrationProof } from '../api/authApi.js';

const TELEGRAM_BOT_NAME = getRuntimeConfigValue('VITE_TELEGRAM_BOT_NAME') || import.meta.env.VITE_TELEGRAM_BOT_NAME;

export function TelegramLoginButton({ children }) {
  const { t } = useI18n();
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { saveSession } = useSession();
  const [error, setError] = useState('');
  const [isEarlyAccessLoading, setIsEarlyAccessLoading] = useState(false);
  const [deviceId] = useState(() => crypto.randomUUID());

  async function handleEarlyAccess() {
    setError('');
    setIsEarlyAccessLoading(true);
    try {
      const result = await createEarlyAccessRegistrationProof();
      navigate('/register', { state: { registrationProof: result.registration_proof } });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsEarlyAccessLoading(false);
    }
  }

  useEffect(() => {
    window.onTelegramAuth = async (payload) => {
      try {
        const result = await apiRequest('/api/auth/telegram/callback', { method: 'POST', body: { payload, device_id: deviceId } });
        if (result.is_registered) {
          saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token ?? null, user: result.user });
          navigate('/app');
          return;
        }
        navigate('/register', { state: { registrationProof: result.registration_proof } });
      } catch (err) {
        setError(err.message);
      }
    };

    if (!TELEGRAM_BOT_NAME || !containerRef.current) {
      return undefined;
    }

    containerRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', TELEGRAM_BOT_NAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    containerRef.current.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
    };
  }, [deviceId, navigate, saveSession]);

  if (!TELEGRAM_BOT_NAME) {
    return (
      <div className="telegram-widget-wrap">
        <button className="button button-primary" type="button" onClick={handleEarlyAccess} disabled={isEarlyAccessLoading}>
          {isEarlyAccessLoading ? t('auth.preparingAccess') : t('auth.earlyAccess')}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="telegram-widget-wrap">
      <div ref={containerRef} />
      <button className="button button-secondary" type="button" onClick={handleEarlyAccess} disabled={isEarlyAccessLoading}>
        {isEarlyAccessLoading ? t('auth.preparingAccess') : t('auth.earlyAccess')}
      </button>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
