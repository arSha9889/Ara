import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { loginWithPassword, loginWithPin } from '../api/authApi.js';

export function LoginPage() {
  const { t } = useI18n();
  const { saveSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '', pin: '', device_id: getDeviceId() });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function navigateAfterLogin() {
    navigate(location.state?.from?.pathname || '/app', { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await loginWithPassword({ identifier: form.identifier, password: form.password, device_id: form.device_id });
      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user: result.user });
      navigateAfterLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePinLogin() {
    setError('');
    setIsLoading(true);
    try {
      const result = await loginWithPin({ identifier: form.identifier, pin: form.pin, device_id: form.device_id });
      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user: result.user });
      navigateAfterLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="panel auth-card" onSubmit={handleSubmit}>
        <div className="auth-card-head">
          <Link to="/" className="brand compact">
            <img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" />
            <span>AraChat</span>
          </Link>
          <div>
            <h1>{t('auth.loginTitle')}</h1>
            <p className="muted">{t('auth.loginSubtitle')}</p>
          </div>
        </div>
        <div className="auth-fields">
          <TextInput label={t('auth.identifier')} inputMode="text" autoComplete="username" value={form.identifier} onChange={(event) => updateField('identifier', event.target.value)} required />
          <TextInput label={t('auth.password')} type="password" autoComplete="current-password" value={form.password} onChange={(event) => updateField('password', event.target.value)} required />
          <TextInput label={t('auth.pin')} inputMode="numeric" autoComplete="off" value={form.pin} onChange={(event) => updateField('pin', event.target.value)} />
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="auth-actions">
          <Button type="submit" disabled={isLoading}>{isLoading ? t('auth.signingIn') : t('auth.signIn')}</Button>
          <Button type="button" variant="secondary" disabled={isLoading || !form.identifier || !form.pin} onClick={handlePinLogin}>{t('auth.signInWithPin')}</Button>
        </div>
        <Link to="/region" className="auth-switch-link">{t('auth.createAccount')}</Link>
        <Link to="/admin" className="admin-entry-link">
          <span className="admin-entry-icon" aria-hidden="true">✦</span>
          <span className="admin-entry-copy">
            <strong>Админ-панель</strong>
            <small>Защищённое рабочее пространство</small>
          </span>
          <span className="admin-entry-arrow" aria-hidden="true">→</span>
        </Link>
      </form>
    </main>
  );
}
