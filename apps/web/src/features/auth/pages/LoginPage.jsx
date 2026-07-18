import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [form, setForm] = useState({ phone: '', password: '', pin: '', device_id: getDeviceId() });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await loginWithPassword({ identifier: form.phone, password: form.password, device_id: form.device_id });
      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user: result.user });
      navigate('/app');
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
      const result = await loginWithPin({ identifier: form.phone, pin: form.pin, device_id: form.device_id });
      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user: result.user });
      navigate('/app');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="panel" onSubmit={handleSubmit}>
        <Link to="/" className="brand compact">
          <img className="brand-mark" src="/icons/nexus-icon-192.png" alt="" aria-hidden="true" />
          <span>Nexus</span>
        </Link>
        <h1>{t('auth.loginTitle')}</h1>
        <TextInput label={t('auth.phone')} inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} required />
        <TextInput label={t('auth.password')} type="password" autoComplete="current-password" value={form.password} onChange={(event) => updateField('password', event.target.value)} required />
        <TextInput label={t('auth.pin')} inputMode="numeric" autoComplete="off" value={form.pin} onChange={(event) => updateField('pin', event.target.value)} />
        {error ? <p className="error-text">{error}</p> : null}
        <Button type="submit" disabled={isLoading}>{isLoading ? t('auth.signingIn') : t('auth.signIn')}</Button>
        <Button type="button" variant="secondary" disabled={isLoading || !form.phone || !form.pin} onClick={handlePinLogin}>{t('auth.signInWithPin')}</Button>
        <Link to="/onboarding">{t('auth.createAccount')}</Link>
      </form>
    </main>
  );
}
