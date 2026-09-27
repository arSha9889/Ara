import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { getRegion } from '../../../shared/region/regions.js';
import { RegionSelector } from '../../../shared/ui/RegionSelector.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { loginWithPassword, loginWithPin, startOAuth } from '../api/authApi.js';
import { PublicSiteHeader } from '../../onboarding/components/PublicSiteHeader.jsx';

export function LoginPage() {
  const { setLanguage, t } = useI18n();
  const { saveSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '', pin: '', device_id: getDeviceId() });
  const [selectedCountry, setSelectedCountry] = useState(() => (
    getRegion(localStorage.getItem('nexus_registration_country') ?? 'RU').id
  ));
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function navigateAfterLogin() {
    navigate(location.state?.from?.pathname || '/app', { replace: true });
  }

  function handleRegionChange({ country, language }) {
    setSelectedCountry(country);
    localStorage.setItem('nexus_registration_country', country);
    setLanguage(language);
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

  async function handleOAuth(provider) {
    setError('');
    setIsLoading(true);
    try {
      sessionStorage.setItem('arachat_oauth_flow', 'login');
      const result = await startOAuth(provider, { device_id: form.device_id });
      window.location.assign(result.authorization_url);
    } catch (err) {
      sessionStorage.removeItem('arachat_oauth_flow');
      setError(err.message);
      setIsLoading(false);
    }
  }

  return (
    <main className="public-page public-auth-page">
      <div className="public-shell">
        <PublicSiteHeader minimal publicOnly={false} />
        <section className="auth-page">
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
          <RegionSelector country={selectedCountry} onChange={handleRegionChange} />
        </div>
        <div className="auth-fields">
          <TextInput label={t('auth.identifier')} name="identifier" inputMode="text" autoComplete="username" spellCheck={false} value={form.identifier} onChange={(event) => updateField('identifier', event.target.value)} required />
          <TextInput label={t('auth.password')} name="password" type="password" autoComplete="current-password" value={form.password} onChange={(event) => updateField('password', event.target.value)} required />
          <TextInput label={t('auth.pin')} name="pin" inputMode="numeric" autoComplete="off" spellCheck={false} value={form.pin} onChange={(event) => updateField('pin', event.target.value)} />
        </div>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <div className="auth-actions">
          <Button type="submit" disabled={isLoading}>{isLoading ? t('auth.signingIn') : t('auth.signIn')}</Button>
          <Button type="button" variant="secondary" disabled={isLoading || !form.identifier || !form.pin} onClick={handlePinLogin}>{t('auth.signInWithPin')}</Button>
        </div>
        <div className="oauth-actions" aria-label={t('auth.oauthLabel')}>
          <span className="muted">{t('auth.oauthLabel')}</span>
          <Button type="button" variant="secondary" disabled={isLoading} onClick={() => handleOAuth('yandex')}>{t('auth.signInWithYandex')}</Button>
          <Button type="button" variant="secondary" disabled={isLoading} onClick={() => handleOAuth('vk')}>{t('auth.signInWithVk')}</Button>
        </div>
        <Link to="/password-recovery" className="auth-switch-link">{t('auth.forgotPassword')}</Link>
        <Link to="/register" className="auth-switch-link">{t('auth.createAccount')}</Link>
          </form>
        </section>
      </div>
    </main>
  );
}
