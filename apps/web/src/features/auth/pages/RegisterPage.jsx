import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { BUILT_IN_AVATARS, AVATAR_EMOJIS } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { uploadAvatar } from '../../chats/api/uploadApi.js';
import { checkUsername, updateMyProfile } from '../../profile/api/userApi.js';
import {
  completeRegistration,
  confirmPhoneVerification,
  createDevRegistrationProof,
  startPhoneVerification,
} from '../api/authApi.js';

const AVATAR_MAX_SIZE_BYTES = 50 * 1024 * 1024;
const PHONE_COUNTRIES = [
  { code: 'RU', dialCode: '+7', flag: '🇷🇺', labelKey: 'phoneCountryRussia', placeholder: '+7 999 123-45-67' },
  { code: 'KZ', dialCode: '+7', flag: '🇰🇿', labelKey: 'phoneCountryKazakhstan', placeholder: '+7 701 123-45-67' },
];

export function RegisterPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { saveSession } = useSession();
  const isDevMode = import.meta.env.DEV;
  const [form, setForm] = useState({
    registration_proof: '',
    phone_verification_id: null,
    country: 'RU',
    phone: '',
    phone_code: '',
    username: '',
    password: '',
    pin: '',
    device_id: getDeviceId(),
    language,
    design_theme: 'halo',
    avatar_type: 'built_in',
    avatar_ref: 'animal-01',
  });
  const [step, setStep] = useState('access');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [usernameState, setUsernameState] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDevProofLoading, setIsDevProofLoading] = useState(false);
  const [isPhoneRequestLoading, setIsPhoneRequestLoading] = useState(false);
  const [isPhoneConfirmLoading, setIsPhoneConfirmLoading] = useState(false);
  const [phoneVerification, setPhoneVerification] = useState(null);
  const [phoneStatus, setPhoneStatus] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const selectedPhoneCountry = PHONE_COUNTRIES.find((country) => country.code === form.country) ?? PHONE_COUNTRIES[0];

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetPhoneVerification(nextFields = {}) {
    setForm((current) => ({
      ...current,
      ...nextFields,
      registration_proof: '',
      phone_verification_id: null,
      phone_code: '',
    }));
    setPhoneVerification(null);
    setIsPhoneVerified(false);
    setPhoneStatus('');
  }

  async function handleUsernameBlur() {
    if (form.username.length < 3) {
      setUsernameState('');
      return;
    }
    try {
      const result = await checkUsername(form.username);
      setUsernameState(result.available ? t('register.usernameAvailable') : t('register.usernameTaken'));
    } catch (err) {
      setUsernameState(err.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!form.registration_proof) {
      setError(t('register.phoneRequestRequired'));
      return;
    }
    setIsLoading(true);
    try {
      const registrationPayload = avatarFile
        ? { ...form, avatar_type: 'built_in', avatar_ref: 'animal-01' }
        : { ...form };
      delete registrationPayload.country;
      delete registrationPayload.phone;
      delete registrationPayload.phone_code;
      if (!isPhoneVerified) {
        delete registrationPayload.phone_verification_id;
      }
      const result = await completeRegistration({ ...registrationPayload, pin: form.pin || null });
      let user = result.user;
      if (avatarFile) {
        try {
          const uploaded = await uploadAvatar(result.access_token, avatarFile);
          user = await updateMyProfile(result.access_token, { avatar_type: 'uploaded', avatar_ref: uploaded.media_url });
        } catch {
          user = result.user;
        }
      }
      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleAccessStep(event) {
    event.preventDefault();
    setError('');
    if (!form.registration_proof) {
      setError(t('register.phoneRequestRequired'));
      return;
    }
    setStep('profile');
  }

  async function handleCreateDevProof() {
    setError('');
    setIsDevProofLoading(true);
    try {
      const result = await createDevRegistrationProof(`dev-${crypto.randomUUID()}`);
      updateField('registration_proof', result.registration_proof);
      setIsPhoneVerified(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDevProofLoading(false);
    }
  }

  async function handleStartPhoneVerification() {
    setError('');
    setPhoneStatus('');
    setIsPhoneRequestLoading(true);
    try {
      const result = await startPhoneVerification({ country: form.country, phone: form.phone, device_id: form.device_id });
      setForm((current) => ({
        ...current,
        phone_verification_id: result.verification_id,
        phone_code: '',
        registration_proof: '',
      }));
      setPhoneVerification(result);
      setIsPhoneVerified(false);
      setPhoneStatus(t('register.phoneBotOpened'));
      const opened = window.open(result.bot_url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        window.location.href = result.bot_url;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPhoneRequestLoading(false);
    }
  }

  async function handleConfirmPhoneCode() {
    setError('');
    setPhoneStatus('');
    if (!form.phone_verification_id) {
      setError(t('register.phoneRequestRequired'));
      return;
    }
    setIsPhoneConfirmLoading(true);
    try {
      const result = await confirmPhoneVerification({ verification_id: form.phone_verification_id, code: form.phone_code });
      updateField('registration_proof', result.registration_proof);
      updateField('phone', result.phone);
      setIsPhoneVerified(true);
      setPhoneStatus(t('register.phoneConfirmed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPhoneConfirmLoading(false);
    }
  }

  function handleAvatarFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('register.avatarImageOnly'));
      return;
    }
    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      setError(t('register.avatarTooLarge'));
      return;
    }
    setError('');
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    const previewUrl = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreview(previewUrl);
    updateField('avatar_type', 'uploaded');
    updateField('avatar_ref', previewUrl);
  }

  function selectBuiltInAvatar(avatarRef) {
    setAvatarFile(null);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview('');
    updateField('avatar_type', 'built_in');
    updateField('avatar_ref', avatarRef);
  }

  async function handleProfileStep(event) {
    event.preventDefault();
    setError('');
    if (!form.username.trim()) {
      setError('Username is required');
      return;
    }
    await handleUsernameBlur();
    setStep('password');
  }

  const submitHandler = step === 'access'
    ? handleAccessStep
    : step === 'profile'
      ? handleProfileStep
      : handleSubmit;

  return (
    <main className="auth-page">
      <form className="panel readable" onSubmit={submitHandler}>
        <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/nexus-icon-192.png" alt="" aria-hidden="true" /><span>Nexus</span></Link>
        <h1>{t('register.title')}</h1>
        <p className="muted">{t('register.subtitle')}</p>
        <div className="registration-steps" aria-label={t('register.steps')}>
          <span className={step === 'access' ? 'active' : ''}>1. {t('register.accessStep')}</span>
          <span className={step === 'profile' ? 'active' : ''}>2. {t('register.profileStep')}</span>
          <span className={step === 'password' ? 'active' : ''}>3. {t('register.passwordStep')}</span>
        </div>
        {step === 'access' ? (
          <section className="access-step-shell" aria-label={t('register.accessStep')}>
            <div className="access-hero-card">
              <div className="access-hero-orb" aria-hidden="true">✦</div>
              <div className="access-hero-copy">
                <span className="access-kicker">{t('register.accessKicker')}</span>
                <h2>{t('register.accessTitle')}</h2>
                <p>{t('register.accessText')}</p>
              </div>
              <div className="access-chat-preview" aria-hidden="true">
                <div className="access-chat-row incoming">
                  <span className="access-chat-avatar">N</span>
                  <span className="access-chat-bubble">{t('register.accessPreviewBot')}</span>
                </div>
                <div className="access-chat-row outgoing">
                  <span className="access-chat-bubble">{t('register.accessPreviewUser')}</span>
                </div>
                <div className="access-chat-code">•• {form.phone_code || '0000'} ••</div>
              </div>
            </div>
            {isDevMode ? (
              <div className="info-card halo-outline">
                <strong>{t('register.devTitle')}</strong>
                <p className="muted">{t('register.devText')}</p>
                <Button type="button" variant="secondary" onClick={handleCreateDevProof} disabled={isDevProofLoading}>
                  {isDevProofLoading ? t('register.creatingProof') : t('register.createDevProof')}
                </Button>
              </div>
            ) : null}
            <div className="info-card halo-outline phone-verification-card access-card">
              <div className="access-card-head">
                <span className="access-card-icon" aria-hidden="true">✈</span>
                <div>
                  <strong>{t('register.phoneTitle')}</strong>
                  <p className="muted">{t('register.phoneText')}</p>
                </div>
              </div>
              <div className="access-mini-steps" aria-label={t('register.accessChecklist')}>
                <span className={form.phone_verification_id ? 'done' : ''}>{t('register.accessStepPhone')}</span>
                <span className={phoneVerification ? 'done' : ''}>{t('register.accessStepBot')}</span>
                <span className={isPhoneVerified ? 'done' : ''}>{t('register.accessStepCode')}</span>
              </div>
              <div className="country-picker access-country-picker" role="radiogroup" aria-label={t('register.phoneCountry')}>
                {PHONE_COUNTRIES.map((country) => (
                  <button
                    className={`country-option ${form.country === country.code ? 'active' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={form.country === country.code}
                    key={country.code}
                    onClick={() => resetPhoneVerification({ country: country.code, phone: '' })}
                  >
                    <span className="country-option-flag" aria-hidden="true">{country.flag}</span>
                    <span className="country-option-copy">
                      <strong>{t(`register.${country.labelKey}`)}</strong>
                      <small>{country.dialCode} · {country.code}</small>
                    </span>
                    <span className="country-option-check" aria-hidden="true">✓</span>
                  </button>
                ))}
              </div>
              <div className="access-phone-row">
                <TextInput
                  label={t('register.phoneLabel')}
                  inputMode="tel"
                  placeholder={selectedPhoneCountry.placeholder}
                  value={form.phone}
                  onChange={(event) => resetPhoneVerification({ phone: event.target.value })}
                />
                <Button type="button" variant="secondary" onClick={handleStartPhoneVerification} disabled={isPhoneRequestLoading || !form.phone.trim()}>
                  {isPhoneRequestLoading ? t('register.phoneRequesting') : t('register.phoneRequestCode')}
                </Button>
              </div>
              {phoneVerification ? (
                <a className="button button-secondary access-bot-link" href={phoneVerification.bot_url} target="_blank" rel="noreferrer">
                  {t('register.phoneOpenBot')}
                </a>
              ) : null}
              <div className="access-code-row">
                <TextInput label={t('register.phoneCodeLabel')} inputMode="numeric" value={form.phone_code} onChange={(event) => updateField('phone_code', event.target.value.replace(/\D/g, '').slice(0, 4))} />
                <Button type="button" variant="secondary" onClick={handleConfirmPhoneCode} disabled={isPhoneConfirmLoading || form.phone_code.length !== 4}>
                  {isPhoneConfirmLoading ? t('register.phoneChecking') : t('register.phoneConfirmCode')}
                </Button>
              </div>
              {phoneStatus ? <p className="success-text">{phoneStatus}</p> : null}
            </div>
            {isDevMode ? <TextInput label="Registration proof" value={form.registration_proof} onChange={(event) => updateField('registration_proof', event.target.value)} required /> : null}
            {error ? <p className="error-text">{error}</p> : null}
            <div className="access-footer-actions">
              <span>{t('register.accessPrivacy')}</span>
              <Button type="submit" disabled={!form.registration_proof}>{t('common.continue')}</Button>
            </div>
          </section>
        ) : null}
        {step === 'profile' ? (
          <>
            <section className="avatar-picker" aria-label={t('register.avatarTitle')}>
              <div className="avatar-picker-head">
                <div>
                  <h2>{t('register.avatarTitle')}</h2>
                  <p className="muted">{t('register.avatarText')}</p>
                </div>
                <button className="avatar-preview" type="button" onClick={() => setIsAvatarPickerOpen((current) => !current)} aria-expanded={isAvatarPickerOpen} aria-label={t('register.avatarTitle')}>
                  {avatarPreview ? <img src={avatarPreview} alt="" /> : <span>{AVATAR_EMOJIS[BUILT_IN_AVATARS.indexOf(form.avatar_ref)] || '🦊'}</span>}
                  <span className="avatar-preview-edit" aria-hidden="true">＋</span>
                </button>
              </div>
              {isAvatarPickerOpen ? (
                <div className="avatar-options-panel">
                  <label className="avatar-upload">
                    <span className="avatar-upload-icon" aria-hidden="true">＋</span>
                    <span className="avatar-upload-copy">
                      <strong>{avatarFile ? avatarFile.name : t('register.uploadAvatar')}</strong>
                      <small>PNG, JPG, GIF, WebP</small>
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => handleAvatarFile(event.target.files?.[0])} />
                  </label>
                  <div className="avatar-grid">
                    {BUILT_IN_AVATARS.map((avatarRef, index) => (
                      <button className={`avatar-choice ${form.avatar_type === 'built_in' && form.avatar_ref === avatarRef ? 'active' : ''}`} type="button" key={avatarRef} onClick={() => selectBuiltInAvatar(avatarRef)} aria-pressed={form.avatar_type === 'built_in' && form.avatar_ref === avatarRef}>
                        <span aria-hidden="true">{AVATAR_EMOJIS[index]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
            <TextInput label="Username" value={form.username} onChange={(event) => updateField('username', event.target.value)} onBlur={handleUsernameBlur} required />
            {usernameState ? <p className="muted">{usernameState}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
            <button className="button button-secondary" type="button" onClick={() => setStep('access')}>{t('register.backToAccess')}</button>
            <Button type="submit">{t('common.continue')}</Button>
          </>
        ) : null}
        {step === 'password' ? (
          <>
            <div className="info-card halo-outline">
              <strong>{t('register.passwordTitle')}</strong>
              <p className="muted">{t('register.passwordText')}</p>
              <TextInput label={t('register.password')} type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} required />
              <TextInput label={t('register.optionalPin')} inputMode="numeric" value={form.pin} onChange={(event) => updateField('pin', event.target.value)} />
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="button button-secondary" type="button" onClick={() => setStep('profile')}>{t('register.backToProfile')}</button>
            <Button type="submit" disabled={isLoading || !form.registration_proof}>{isLoading ? t('register.creatingAccount') : t('register.createAccount')}</Button>
          </>
        ) : null}
      </form>
    </main>
  );
}
