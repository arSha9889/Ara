import { useCallback, useEffect, useState } from 'react';

import { AuthField, AuthPasswordField } from '../components/AuthField.jsx';
import { Notice } from '../components/Notice.jsx';
import { WorkspaceIcon as Icon } from '../components/WorkspaceIcon.jsx';
import { confirmPasswordReset, loginWithEmail, startPasswordReset } from '../features/auth/authApi.js';
import { getDeviceId } from '../shared/device/deviceId.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^[a-zA-Z0-9]{5,30}$/;

export function LoginScreen({ language, t, onNavigate, onOpenLegal, onAuthenticated, onCardBackChange }) {
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [resetForm, setResetForm] = useState({ email: '', code: '', password: '', passwordConfirmation: '' });
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
    setNotice('');
  }

  function updateReset(name, value) {
    setResetForm((current) => ({ ...current, [name]: value }));
    setError('');
    setNotice('');
  }

  const returnToLogin = useCallback(() => {
    if (isLoading) return;
    setMode('login');
    setError('');
    setNotice('');
  }, [isLoading]);

  useEffect(() => {
    onCardBackChange?.(mode === 'login' ? null : { disabled: isLoading, onClick: returnToLogin });
    return () => onCardBackChange?.(null);
  }, [isLoading, mode, onCardBackChange, returnToLogin]);

  function openReset() {
    setResetForm((current) => ({ ...current, email: form.email }));
    setMode('reset-request');
    setError('');
    setNotice('');
  }

  async function submit(event) {
    event.preventDefault();
    setNotice('');

    if (mode === 'reset-request') {
      if (!EMAIL_PATTERN.test(resetForm.email)) {
        setError(t('auth.validation.email'));
        return;
      }
      setIsLoading(true);
      try {
        await startPasswordReset({
          email: resetForm.email.trim(),
          deviceId: getDeviceId(),
          language,
        });
        setMode('reset-confirm');
        setNotice(t('auth.resetCodeSent'));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (mode === 'reset-confirm') {
      if (!/^\d{6}$/.test(resetForm.code)) {
        setError(t('auth.validation.code'));
        return;
      }
      if (!PASSWORD_PATTERN.test(resetForm.password)) {
        setError(t('auth.validation.password'));
        return;
      }
      if (resetForm.password !== resetForm.passwordConfirmation) {
        setError(t('auth.validation.passwordMatch'));
        return;
      }
      setIsLoading(true);
      try {
        await confirmPasswordReset({
          email: resetForm.email.trim(),
          code: resetForm.code,
          password: resetForm.password,
          deviceId: getDeviceId(),
        });
        setForm((current) => ({ ...current, email: resetForm.email.trim(), password: '' }));
        setMode('login');
        setNotice(t('auth.resetComplete'));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setIsLoading(false);
      }
      return;
    }

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
    <div className={`auth-form-wrap ${mode === 'login' ? '' : 'auth-reset-wrap'}`}>
      <div className="auth-heading">
        <p>{mode === 'login' ? t('auth.loginKicker') : t('auth.resetKicker')}</p>
        <h1>{mode === 'login' ? t('auth.loginTitle') : mode === 'reset-request' ? t('auth.resetTitle') : t('auth.resetConfirmTitle')}</h1>
        <span>{mode === 'login' ? t('auth.loginText') : mode === 'reset-request' ? t('auth.resetText') : t('auth.resetConfirmText')}</span>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        {mode === 'login' ? <>
          <AuthField id="login-email" label={t('auth.email')} icon="mail" type="email" inputMode="email" autoComplete="email" placeholder={t('auth.emailHint')} value={form.email} onChange={(event) => update('email', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-form-error' : undefined} disabled={isLoading} />
          <AuthPasswordField id="login-password" label={t('auth.password')} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} autoComplete="current-password" placeholder={t('auth.passwordHint')} value={form.password} onChange={(event) => update('password', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-form-error' : undefined} disabled={isLoading} />
          <div className="auth-inline-row">
            <label className="checkbox-row"><input type="checkbox" checked={form.remember} onChange={(event) => update('remember', event.target.checked)} disabled={isLoading} /><span>{t('auth.remember')}</span></label>
            <button className="auth-forgot-link" type="button" disabled={isLoading} onClick={openReset}>{t('auth.forgotPassword')}</button>
          </div>
        </> : mode === 'reset-request' ? <>
          <AuthField id="reset-email" label={t('auth.email')} icon="mail" type="email" inputMode="email" autoComplete="email" placeholder={t('auth.emailHint')} value={resetForm.email} onChange={(event) => updateReset('email', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-form-error' : undefined} disabled={isLoading} />
          <p className="auth-form-hint"><Icon name="shield" size={17} />{t('auth.resetPrivacy')}</p>
        </> : <>
          <p className="auth-reset-email"><Icon name="mail" size={17} /><span>{resetForm.email}</span><button type="button" onClick={() => setMode('reset-request')} disabled={isLoading}>{t('auth.resetChangeEmail')}</button></p>
          <AuthField id="reset-code" label={t('auth.verificationCode')} icon="key" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder={t('auth.codeHint')} maxLength="6" value={resetForm.code} onChange={(event) => updateReset('code', event.target.value.replace(/\D/g, ''))} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-form-error' : undefined} disabled={isLoading} />
          <AuthPasswordField id="reset-password" label={t('auth.passwordCreate')} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} autoComplete="new-password" placeholder={t('auth.passwordHint')} value={resetForm.password} onChange={(event) => updateReset('password', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-form-error' : undefined} disabled={isLoading} />
          <AuthPasswordField id="reset-password-confirmation" label={t('auth.passwordConfirm')} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} autoComplete="new-password" placeholder={t('auth.passwordConfirm')} value={resetForm.passwordConfirmation} onChange={(event) => updateReset('passwordConfirmation', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-form-error' : undefined} disabled={isLoading} />
        </>}
        <Notice id="login-form-error" tone="error">{error}</Notice>
        <Notice>{notice}</Notice>
        <button className="button button-primary button-full auth-submit-button" type="submit" disabled={isLoading}><span>{isLoading ? mode === 'login' ? t('auth.signingIn') : t('common.loading') : mode === 'login' ? t('auth.signIn') : mode === 'reset-request' ? t('auth.resetSendCode') : t('auth.resetSavePassword')}</span><Icon name="arrow-right" size={22} /></button>
      </form>
      {mode === 'login' ? <><p className="auth-switch">{t('auth.newAccount')} <button type="button" onClick={() => onNavigate('register')}>{t('auth.createAccount')}</button></p><p className="auth-doc-links"><button type="button" onClick={() => onOpenLegal('privacy')}>{t('legal.privacyTitle')}</button><span> / </span><button type="button" onClick={() => onOpenLegal('terms')}>{t('legal.termsTitle')}</button></p></> : <p className="auth-switch"><button type="button" onClick={returnToLogin}>{t('auth.backToLogin')}</button></p>}
    </div>
  );
}
