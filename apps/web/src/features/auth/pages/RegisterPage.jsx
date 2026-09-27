import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useTheme } from '../../../app/providers/ThemeProvider.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { getRegion } from '../../../shared/region/regions.js';
import { BUILT_IN_AVATARS, AVATAR_EMOJIS } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { PUBLIC_LANGUAGE_IDS } from '../../../shared/ui/LanguagePicker.jsx';
import { RegionSelector } from '../../../shared/ui/RegionSelector.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { checkUsername } from '../../profile/api/userApi.js';
import { completeRegistration, confirmEmailVerification, startEmailVerification } from '../api/authApi.js';
import { PublicSiteHeader } from '../../onboarding/components/PublicSiteHeader.jsx';


export function RegisterPage() {
  const { t, language, setLanguage } = useI18n();
  const { saveSession } = useSession();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const initialCountry = getRegion(
    location.state?.country ?? localStorage.getItem('nexus_registration_country') ?? 'RU',
  ).id;
  const [country, setCountry] = useState(initialCountry);
  const [step, setStep] = useState('email');
  const [form, setForm] = useState({
    email: '', email_code: '', email_verification_id: null, username: '', password: '', pin: '',
    device_id: getDeviceId(), language: PUBLIC_LANGUAGE_IDS.includes(language) ? language : 'ru', registration_country: initialCountry,
    avatar_type: 'built_in', avatar_ref: 'animal-01', accepted_terms: false, accepted_privacy_policy: false,
  });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usernameState, setUsernameState] = useState('');
  const registrationSteps = ['email', 'profile', 'password'];
  const currentStepIndex = registrationSteps.indexOf(step);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetEmail(value) {
    setForm((current) => ({ ...current, email: value, email_code: '', email_verification_id: null }));
    setStatus('');
  }

  function handleRegionChange({ country: nextCountry, language: nextLanguage }) {
    setCountry(nextCountry);
    setLanguage(nextLanguage);
    localStorage.setItem('nexus_registration_country', nextCountry);
    setForm((current) => ({ ...current, registration_country: nextCountry, language: nextLanguage }));
  }

  async function requestEmailCode() {
    setError('');
    setIsLoading(true);
    try {
      const result = await startEmailVerification({ email: form.email, device_id: form.device_id, language: form.language });
      updateField('email_verification_id', result.verification_id);
      setStatus(t('register.emailCodeSent'));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmEmailCode() {
    if (!form.email_verification_id) {
      setError(t('register.emailRequestRequired'));
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await confirmEmailVerification({ verification_id: form.email_verification_id, code: form.email_code });
      setStatus(t('register.emailConfirmed'));
      setStep('profile');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function checkUsernameAvailability() {
    if (!form.username) return;
    try {
      const result = await checkUsername(form.username);
      setUsernameState(result.available ? t('register.usernameAvailable') : t('register.usernameTaken'));
    } catch (err) {
      setUsernameState(err.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (step === 'email') {
      await confirmEmailCode();
      return;
    }
    if (step === 'profile') {
      setStep('password');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const result = await completeRegistration({ ...form, design_theme: theme, pin: form.pin.trim() || null });
      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user: result.user });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
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
          <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" /><span>AraChat</span></Link>
          <div><h1>{t('register.title')}</h1><p className="muted">{t('register.smtpSubtitle')}</p></div>
          <RegionSelector country={country} onChange={handleRegionChange} />
        </div>
        <ol className="signal-trace" aria-label={t('register.progress')}>
          {registrationSteps.map((registrationStep, index) => (
            <li className={index < currentStepIndex ? 'complete' : index === currentStepIndex ? 'active' : ''} key={registrationStep} aria-current={index === currentStepIndex ? 'step' : undefined}>
              <span aria-hidden="true">{index + 1}</span>
              <strong>{t(`register.steps.${registrationStep}`)}</strong>
            </li>
          ))}
        </ol>
        {step === 'email' ? (
          <div className="auth-fields">
            <TextInput label={t('register.emailLabel')} name="email" type="email" autoComplete="email" spellCheck={false} value={form.email} onChange={(event) => resetEmail(event.target.value)} required />
            <Button type="button" variant="secondary" onClick={requestEmailCode} disabled={isLoading || !form.email}>{t('register.emailRequestCode')}</Button>
            <TextInput label={t('register.emailCodeLabel')} name="email_code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} value={form.email_code} onChange={(event) => updateField('email_code', event.target.value.replace(/\D/g, '').slice(0, 6))} required />
            {status ? <p className="success-text" role="status" aria-live="polite">{status}</p> : null}
          </div>
        ) : null}
        {step === 'profile' ? (
          <div className="auth-fields">
            <TextInput label={t('auth.username')} name="username" autoComplete="username" spellCheck={false} value={form.username} onChange={(event) => updateField('username', event.target.value)} onBlur={checkUsernameAvailability} required />
            {usernameState ? <p className="muted" role="status" aria-live="polite">{usernameState}</p> : null}
            <fieldset className="registration-avatar-picker">
              <legend>{t('register.avatarTitle')}</legend>
              <div className="registration-avatar-grid">
                {BUILT_IN_AVATARS.map((avatar, index) => (
                  <button
                    className={`avatar-choice registration-avatar-choice ${form.avatar_ref === avatar ? 'active' : ''}`}
                    type="button"
                    key={avatar}
                    onClick={() => updateField('avatar_ref', avatar)}
                    aria-label={`${t('register.avatarTitle')}: ${AVATAR_EMOJIS[index]}`}
                    aria-pressed={form.avatar_ref === avatar}
                  >
                    <span aria-hidden="true">{AVATAR_EMOJIS[index]}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
        {step === 'password' ? (
          <div className="auth-fields">
            <TextInput label={t('register.password')} name="password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => updateField('password', event.target.value)} required />
            <TextInput label={t('register.optionalPin')} name="pin" inputMode="numeric" spellCheck={false} value={form.pin} onChange={(event) => updateField('pin', event.target.value.replace(/\D/g, '').slice(0, 8))} />
            <label className="legal-consent-row"><input type="checkbox" checked={form.accepted_privacy_policy} onChange={(event) => updateField('accepted_privacy_policy', event.target.checked)} required /><span>{t('register.acceptPrivacy')} <Link to="/privacy" target="_blank">{t('onboarding.privacyPolicy')}</Link></span></label>
            <label className="legal-consent-row"><input type="checkbox" checked={form.accepted_terms} onChange={(event) => updateField('accepted_terms', event.target.checked)} required /><span>{t('register.acceptTerms')} <Link to="/terms" target="_blank">{t('onboarding.terms')}</Link></span></label>
          </div>
        ) : null}
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <div className="auth-actions">
          {step !== 'email' ? <Button type="button" variant="secondary" onClick={() => setStep(step === 'password' ? 'profile' : 'email')}>{t('common.back')}</Button> : null}
          <Button type="submit" disabled={isLoading || (step === 'email' && (!form.email_verification_id || form.email_code.length !== 6))}>{isLoading ? t('common.loading') : step === 'password' ? t('register.createAccount') : t('common.continue')}</Button>
        </div>
        <Link to="/login" className="auth-switch-link">{t('region.alreadyRegistered')}</Link>
          </form>
        </section>
      </div>
    </main>
  );
}
