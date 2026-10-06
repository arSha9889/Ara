import { useState } from 'react';

import { Notice } from '../components/Notice.jsx';
import { loginWithEmail } from '../features/auth/authApi.js';
import { getDeviceId } from '../shared/device/deviceId.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ t, onNavigate, onOpenLegal, onAuthenticated }) {
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(form.email)) {
      setError(t('auth.validation.email'));
      return;
    }
    if (!form.password) {
      setError(t('common.required'));
      return;
    }
    setIsLoading(true);
    try {
      const session = await loginWithEmail({
        email: form.email.trim(),
        password: form.password,
        deviceId: getDeviceId(),
      });
      await onAuthenticated(session, { remember: form.remember });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-form-wrap">
      <div className="auth-heading">
        <p>{t('auth.loginKicker')}</p>
        <h1>{t('auth.loginTitle')}</h1>
        <span>{t('auth.loginText')}</span>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>{t('auth.email')}</span>
          <input type="email" inputMode="email" autoComplete="email" placeholder={t('auth.emailHint')} value={form.email} onChange={(event) => update('email', event.target.value)} aria-invalid={Boolean(error)} disabled={isLoading} />
        </label>
        <label className="field">
          <span>{t('auth.password')}</span>
          <input type="password" autoComplete="current-password" placeholder={t('auth.passwordHint')} value={form.password} onChange={(event) => update('password', event.target.value)} aria-invalid={Boolean(error)} disabled={isLoading} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={form.remember} onChange={(event) => update('remember', event.target.checked)} disabled={isLoading} />
          <span>{t('auth.remember')}</span>
        </label>
        <Notice tone="error">{error}</Notice>
        <button className="button button-primary button-full" type="submit" disabled={isLoading}>{isLoading ? t('auth.signingIn') : t('auth.signIn')}</button>
      </form>
      <p className="auth-switch">{t('auth.newAccount')} <button type="button" onClick={() => onNavigate('register')}>{t('auth.createAccount')}</button></p>
      <p className="auth-doc-links"><button type="button" onClick={() => onOpenLegal('privacy')}>{t('legal.privacyTitle')}</button><span> / </span><button type="button" onClick={() => onOpenLegal('terms')}>{t('legal.termsTitle')}</button></p>
    </div>
  );
}
