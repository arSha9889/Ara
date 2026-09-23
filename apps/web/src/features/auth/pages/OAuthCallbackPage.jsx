import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { completeOAuthLink, completeOAuthLogin } from '../api/authApi.js';
import { PublicSiteHeader } from '../../onboarding/components/PublicSiteHeader.jsx';


export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { session, saveSession } = useSession();
  const [message, setMessage] = useState(() => t('auth.oauthCompleting'));
  const hasStartedCompletion = useRef(false);

  useEffect(() => {
    if (hasStartedCompletion.current) return;
    hasStartedCompletion.current = true;

    async function complete() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const resultToken = params.get('result');
      const flow = sessionStorage.getItem('arachat_oauth_flow');
      sessionStorage.removeItem('arachat_oauth_flow');
      if (!resultToken) {
        setMessage(t('auth.oauthFailed'));
        return;
      }
      try {
        if (flow === 'link') {
          if (!session.accessToken) throw new Error(t('auth.oauthLinkRequiresLogin'));
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
  }, [navigate, saveSession, session.accessToken, t]);

  return (
    <main className="public-page public-auth-page">
      <div className="public-shell">
        <PublicSiteHeader minimal publicOnly={false} />
        <section className="auth-page"><section className="panel auth-card"><h1>AraChat</h1><p className="muted">{message}</p><Link className="auth-switch-link" to="/login">{t('common.backToLogin')}</Link></section></section>
      </div>
    </main>
  );
}
