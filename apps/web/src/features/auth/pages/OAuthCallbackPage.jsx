import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { completeOAuthLink, completeOAuthLogin } from '../api/authApi.js';


export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { session, saveSession } = useSession();
  const [message, setMessage] = useState('Завершаем вход…');

  useEffect(() => {
    async function complete() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const resultToken = params.get('result');
      const flow = sessionStorage.getItem('arachat_oauth_flow');
      sessionStorage.removeItem('arachat_oauth_flow');
      if (!resultToken) {
        setMessage('Не удалось завершить вход через внешний аккаунт. Попробуйте ещё раз.');
        return;
      }
      try {
        if (flow === 'link') {
          if (!session.accessToken) throw new Error('Войдите в AraChat, чтобы завершить привязку аккаунта.');
          await completeOAuthLink(session.accessToken, resultToken, getDeviceId());
          navigate('/app/settings', { replace: true, state: { oauthLinked: true } });
          return;
        }
        const result = await completeOAuthLogin(resultToken, getDeviceId());
        saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user: result.user });
        navigate('/app', { replace: true });
      } catch (err) {
        setMessage(err.message);
      }
    }
    complete();
  }, [navigate, saveSession, session.accessToken]);

  return <main className="auth-page"><section className="panel auth-card"><h1>AraChat</h1><p className="muted">{message}</p><Link className="auth-switch-link" to="/login">Вернуться ко входу</Link></section></main>;
}
