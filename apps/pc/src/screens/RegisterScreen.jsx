import { useCallback, useEffect, useState } from 'react';

import { AuthField, AuthPasswordField } from '../components/AuthField.jsx';
import { Notice } from '../components/Notice.jsx';
import { WorkspaceIcon as Icon } from '../components/WorkspaceIcon.jsx';
import {
  completeRegistration,
  confirmEmailVerification,
  startEmailVerification,
} from '../features/auth/authApi.js';
import { getDeviceId } from '../shared/device/deviceId.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9]{3,32}$/;
const PASSWORD_PATTERN = /^[a-zA-Z0-9]{5,30}$/;
const COUNTRIES = ['RU', 'KZ', 'KG', 'UA', 'BY', 'UZ'];

export function RegisterScreen({ language, t, onNavigate, onOpenLegal, onAuthenticated, onCardBackChange }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ email: '', code: '', verificationId: null, country: '', displayName: '', username: '', password: '', passwordConfirmation: '', privacy: false, terms: false });
  const [codeRequested, setCodeRequested] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const steps = [
    t('auth.steps.email'),
    t('auth.steps.profile'),
    t('auth.steps.security'),
  ];

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
    setNotice('');
  }

  function updateEmail(value) {
    setForm((current) => ({ ...current, email: value, code: '', verificationId: null }));
    setCodeRequested(false);
    setError('');
    setNotice('');
  }

  const goBack = useCallback(() => {
    setStep((current) => Math.max(0, current - 1));
    setError('');
    setNotice('');
  }, []);

  useEffect(() => {
    onCardBackChange?.(step > 0 ? { disabled: isLoading, onClick: goBack } : null);
    return () => onCardBackChange?.(null);
  }, [goBack, isLoading, onCardBackChange, step]);

  async function requestCode() {
    if (!EMAIL_PATTERN.test(form.email)) {
      setError(t('auth.validation.email'));
      return;
    }
    if (!form.country) {
      setError(t('auth.validation.country'));
      return;
    }

    setError('');
    setNotice('');
    setIsLoading(true);
    try {
      const result = await startEmailVerification({
        email: form.email.trim(),
        deviceId: getDeviceId(),
        language,
      });
      setForm((current) => ({ ...current, verificationId: result.verification_id }));
      setCodeRequested(true);
      setNotice(t('auth.emailCodeSent', { minutes: Math.ceil(result.expires_in_seconds / 60) }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function validateCurrentStep() {
    if (step === 0) {
      if (!EMAIL_PATTERN.test(form.email)) return t('auth.validation.email');
      if (!form.country) return t('auth.validation.country');
      if (!codeRequested || !form.verificationId || !/^\d{6}$/.test(form.code)) return t('auth.validation.code');
    }
    if (step === 1) {
      if (!form.displayName.trim()) return t('auth.validation.displayName');
      if (!USERNAME_PATTERN.test(form.username)) return t('auth.validation.username');
    }
    if (step === 2) {
      if (!PASSWORD_PATTERN.test(form.password)) return t('auth.validation.password');
      if (form.password !== form.passwordConfirmation) return t('auth.validation.passwordMatch');
      if (!form.privacy || !form.terms) return t('auth.validation.legal');
    }
    return '';
  }

  async function goForward(event) {
    event.preventDefault();
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsLoading(true);
    try {
      if (step === 0) {
        const confirmation = await confirmEmailVerification({
          verificationId: form.verificationId,
          code: form.code,
        });
        setForm((current) => ({ ...current, email: confirmation.email }));
        setNotice(t('auth.emailConfirmed'));
        setStep(1);
        return;
      }

      if (step === 1) {
        setStep(2);
        return;
      }

      const session = await completeRegistration({
        verificationId: form.verificationId,
        username: form.username,
        password: form.password,
        deviceId: getDeviceId(),
        language,
        country: form.country,
        displayName: form.displayName.trim(),
        acceptedTerms: form.terms,
        acceptedPrivacyPolicy: form.privacy,
      });
      await onAuthenticated(session, { remember: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-form-wrap register-form-wrap">
      <div className="auth-heading">
        <p>{t('auth.registerKicker')}</p>
        <h1>{t('auth.registerTitle')}</h1>
        <span>{t('auth.registerText')}</span>
      </div>
      <ol className="registration-steps" aria-label={t('auth.registerKicker')}>
        {steps.map((label, index) => <li className={index === step ? 'is-current' : index < step ? 'is-complete' : ''} key={label}><span>{index + 1}</span><small>{label}</small></li>)}
      </ol>
      <form className="auth-form" onSubmit={goForward} noValidate>
        {step === 0 ? (
          <>
            <div className="auth-field auth-select-field">
              <label className="sr-only" htmlFor="registration-country">{t('auth.registrationCountry')}</label>
              <div className="auth-input-shell"><Icon name="globe" size={22} /><select id="registration-country" value={form.country} onChange={(event) => update('country', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'registration-form-error' : undefined} disabled={isLoading}>
                <option value="">{t('auth.selectCountry')}</option>
                {COUNTRIES.map((country) => <option value={country} key={country}>{t(`auth.countries.${country}`)}</option>)}
              </select></div>
            </div>
            <AuthField id="registration-email" label={t('auth.email')} icon="mail" type="email" inputMode="email" autoComplete="email" placeholder={t('auth.emailHint')} value={form.email} onChange={(event) => updateEmail(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'registration-form-error' : undefined} disabled={isLoading} />
            <button className="button button-secondary button-full" type="button" onClick={requestCode} disabled={isLoading}>{codeRequested ? t('auth.resendCode') : t('auth.sendCode')}</button>
            {codeRequested ? <AuthField id="registration-code" label={t('auth.verificationCode')} icon="key" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder={t('auth.codeHint')} maxLength="6" value={form.code} onChange={(event) => update('code', event.target.value.replace(/\D/g, ''))} aria-invalid={Boolean(error)} aria-describedby={error ? 'registration-form-error' : undefined} disabled={isLoading} /> : null}
          </>
        ) : null}
        {step === 1 ? (
          <>
            <AuthField id="registration-name" label={t('auth.displayName')} icon="profile" type="text" autoComplete="name" placeholder={t('auth.displayNameHint')} value={form.displayName} onChange={(event) => update('displayName', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'registration-form-error' : undefined} disabled={isLoading} />
            <div className="auth-field"><label className="sr-only" htmlFor="registration-username">{t('auth.username')}</label><div className="auth-input-shell"><Icon name="at" size={22} /><input id="registration-username" type="text" autoComplete="username" spellCheck="false" placeholder={t('auth.usernameHint')} value={form.username} onChange={(event) => update('username', event.target.value.replace(/\s/g, ''))} aria-invalid={Boolean(error)} aria-describedby={error ? 'registration-form-error' : undefined} disabled={isLoading} /></div><small>{t('auth.usernameDescription')}</small></div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <AuthPasswordField id="registration-password" label={t('auth.passwordCreate')} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} autoComplete="new-password" placeholder={t('auth.passwordCreate')} value={form.password} onChange={(event) => update('password', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'registration-form-error' : undefined} disabled={isLoading} />
            <p className="auth-field-note">{t('auth.passwordHelp')}</p>
            <AuthPasswordField id="registration-password-confirmation" label={t('auth.passwordConfirm')} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} autoComplete="new-password" placeholder={t('auth.passwordConfirm')} value={form.passwordConfirmation} onChange={(event) => update('passwordConfirmation', event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'registration-form-error' : undefined} disabled={isLoading} />
            <div className="checkbox-row legal-check"><input id="privacy-consent" type="checkbox" checked={form.privacy} onChange={(event) => update('privacy', event.target.checked)} disabled={isLoading} /><label htmlFor="privacy-consent">{t('auth.privacyAcceptBefore')}</label><button type="button" onClick={() => onOpenLegal('privacy')} disabled={isLoading}>{t('legal.privacyTitle')}</button><span>.</span></div>
            <div className="checkbox-row legal-check"><input id="terms-consent" type="checkbox" checked={form.terms} onChange={(event) => update('terms', event.target.checked)} disabled={isLoading} /><label htmlFor="terms-consent">{t('auth.termsAcceptBefore')}</label><button type="button" onClick={() => onOpenLegal('terms')} disabled={isLoading}>{t('legal.termsTitle')}</button><span>.</span></div>
          </>
        ) : null}
        <Notice id="registration-form-error" tone="error">{error}</Notice>
        <Notice>{notice}</Notice>
        <div className="registration-actions">
          <button className="button button-primary" type="submit" disabled={isLoading}>{isLoading ? t('common.loading') : step === 2 ? t('auth.create') : t('common.continue')}</button>
        </div>
      </form>
      <p className="auth-switch">{t('auth.already')} <button type="button" onClick={() => onNavigate('login')}>{t('auth.signIn')}</button></p>
    </div>
  );
}
