import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { loginWithPassword } from '../../auth/api/authApi.js';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { PublicSiteHeader } from '../../onboarding/components/PublicSiteHeader.jsx';

export function AdminLoginPage() {
  const { session, saveSession, clearSession, isSessionLoading } = useSession();
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isSessionLoading && session.user?.is_official) {
    return <Navigate to="/admin" replace />;
  }

  function updateField(field, value) {
    setCredentials((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await loginWithPassword({
        identifier: credentials.identifier,
        password: credentials.password,
        device_id: getDeviceId(),
      });

      if (!result.user?.is_official) {
        clearSession();
        setError('Этот аккаунт не имеет доступа к панели управления.');
        return;
      }

      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user: result.user });
      navigate('/admin', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="public-page ara-page ara-auth-page ara-admin-access-page" aria-labelledby="admin-login-title">
      <div className="public-shell">
        <PublicSiteHeader minimal showAuthAction={false} showLanguage={false} />
        <section className="auth-page">
          <form className="panel auth-card" onSubmit={handleSubmit}>
            <span className="ara-admin-access-icon" aria-hidden="true"><Icon name="shield" size={23} /></span>
            <p className="eyebrow">Служебный доступ</p>
            <h1 id="admin-login-title">Панель управления AraChat</h1>
            <p className="muted">Вход доступен только для настроенного административного аккаунта.</p>
            <div className="auth-fields">
              <TextInput label="E-mail или AraChat ID" name="identifier" autoComplete="username" value={credentials.identifier} onChange={(event) => updateField('identifier', event.target.value)} required />
              <TextInput label="Пароль" name="password" type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => updateField('password', event.target.value)} required />
            </div>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button className="button button-primary" type="submit" disabled={isSubmitting || isSessionLoading}>
              {isSubmitting ? 'Проверяем доступ…' : 'Войти в панель'}
            </button>
            <Link className="auth-switch-link" to="/">Вернуться на сайт</Link>
          </form>
        </section>
      </div>
    </main>
  );
}
