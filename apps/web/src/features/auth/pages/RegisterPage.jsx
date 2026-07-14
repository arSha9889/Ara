import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { uploadAvatar } from '../../chats/api/uploadApi.js';
import { checkUsername, updateMyProfile } from '../../profile/api/userApi.js';
import { completeRegistration, createDevRegistrationProof, createEarlyAccessRegistrationProof } from '../api/authApi.js';

const BUILT_IN_AVATARS = Array.from({ length: 20 }, (_, index) => `animal-${String(index + 1).padStart(2, '0')}`);
const AVATAR_EMOJIS = ['🦊', '🐼', '🐯', '🦁', '🐨', '🐸', '🐵', '🐧', '🦉', '🐺', '🐰', '🦄', '🐙', '🐢', '🦋', '🐝', '🦕', '🐬', '🦭', '🐿️'];
const AVATAR_MAX_SIZE_BYTES = 50 * 1024 * 1024;

export function RegisterPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { saveSession } = useSession();
  const isDevMode = import.meta.env.DEV;
  const [form, setForm] = useState({
    registration_proof: location.state?.registrationProof ?? '',
    username: '',
    password: '',
    pin: '',
    device_id: getDeviceId(),
    language,
    design_theme: 'halo',
    avatar_type: 'built_in',
    avatar_ref: 'animal-01',
  });
  const [step, setStep] = useState('profile');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [usernameState, setUsernameState] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDevProofLoading, setIsDevProofLoading] = useState(false);
  const [isEarlyAccessLoading, setIsEarlyAccessLoading] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
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
    setIsLoading(true);
    try {
      const registrationPayload = avatarFile
        ? { ...form, avatar_type: 'built_in', avatar_ref: 'animal-01' }
        : form;
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
      setRecoveryCode(result.recovery_code);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateDevProof() {
    setError('');
    setIsDevProofLoading(true);
    try {
      const result = await createDevRegistrationProof(`dev-${crypto.randomUUID()}`);
      updateField('registration_proof', result.registration_proof);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDevProofLoading(false);
    }
  }

  async function handleCreateEarlyAccessProof() {
    setError('');
    setIsEarlyAccessLoading(true);
    try {
      const result = await createEarlyAccessRegistrationProof();
      updateField('registration_proof', result.registration_proof);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsEarlyAccessLoading(false);
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
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    updateField('avatar_type', 'uploaded');
    updateField('avatar_ref', avatarPreview || 'custom-avatar');
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
    setStep('credentials');
  }

  if (recoveryCode) {
    return (
      <main className="auth-page">
        <section className="panel readable">
          <h1>{t('register.recoveryTitle')}</h1>
          <p className="muted">{t('register.recoveryHint')}</p>
          <div className="info-card halo-outline"><strong>{recoveryCode}</strong></div>
          <Button onClick={() => navigate('/app')}>{t('register.recoverySaved')}</Button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="panel readable" onSubmit={step === 'profile' ? handleProfileStep : handleSubmit}>
        <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/nexus-icon-192.png" alt="" aria-hidden="true" /><span>Nexus</span></Link>
        <h1>{t('register.title')}</h1>
        <p className="muted">{t('register.subtitle')}</p>
        <div className="registration-steps" aria-label={t('register.steps')}>
          <span className={step === 'profile' ? 'active' : ''}>1. {t('register.profileStep')}</span>
          <span className={step === 'credentials' ? 'active' : ''}>2. {t('register.credentialsStep')}</span>
        </div>
        {step === 'profile' ? (
          <>
            <TextInput label="Username" value={form.username} onChange={(event) => updateField('username', event.target.value)} onBlur={handleUsernameBlur} required />
            {usernameState ? <p className="muted">{usernameState}</p> : null}
            <section className="avatar-picker" aria-label={t('register.avatarTitle')}>
              <div className="avatar-picker-head">
                <div>
                  <h2>{t('register.avatarTitle')}</h2>
                  <p className="muted">{t('register.avatarText')}</p>
                </div>
                <div className="avatar-preview">
                  {avatarPreview ? <img src={avatarPreview} alt="" /> : <span>{AVATAR_EMOJIS[BUILT_IN_AVATARS.indexOf(form.avatar_ref)] || '🦊'}</span>}
                </div>
              </div>
              <div className="avatar-grid">
                {BUILT_IN_AVATARS.map((avatarRef, index) => (
                  <button className={`avatar-choice ${form.avatar_type === 'built_in' && form.avatar_ref === avatarRef ? 'active' : ''}`} type="button" key={avatarRef} onClick={() => selectBuiltInAvatar(avatarRef)}>
                    <span aria-hidden="true">{AVATAR_EMOJIS[index]}</span>
                  </button>
                ))}
              </div>
              <label className="avatar-upload">
                <span>{avatarFile ? avatarFile.name : t('register.uploadAvatar')}</span>
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => handleAvatarFile(event.target.files?.[0])} />
              </label>
            </section>
            {error ? <p className="error-text">{error}</p> : null}
            <Button type="submit">{t('common.continue')}</Button>
          </>
        ) : (
          <>
        {!form.registration_proof ? (
          <div className="info-card halo-outline">
            <strong>{t('register.earlyAccessTitle')}</strong>
            <p className="muted">{t('register.earlyAccessText')}</p>
            <Button type="button" variant="secondary" onClick={handleCreateEarlyAccessProof} disabled={isEarlyAccessLoading}>
              {isEarlyAccessLoading ? t('register.creatingAccess') : t('register.createEarlyAccess')}
            </Button>
          </div>
        ) : null}
        {isDevMode ? (
          <div className="info-card halo-outline">
            <strong>{t('register.devTitle')}</strong>
            <p className="muted">{t('register.devText')}</p>
            <Button type="button" variant="secondary" onClick={handleCreateDevProof} disabled={isDevProofLoading}>
              {isDevProofLoading ? t('register.creatingProof') : t('register.createDevProof')}
            </Button>
          </div>
        ) : null}
        <TextInput label="Registration proof" value={form.registration_proof} onChange={(event) => updateField('registration_proof', event.target.value)} required />
        <TextInput label={t('register.password')} type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} required />
        <TextInput label={t('register.optionalPin')} inputMode="numeric" value={form.pin} onChange={(event) => updateField('pin', event.target.value)} />
        {error ? <p className="error-text">{error}</p> : null}
        <button className="button button-secondary" type="button" onClick={() => setStep('profile')}>{t('register.backToProfile')}</button>
        <Button type="submit" disabled={isLoading}>{isLoading ? t('register.creatingAccount') : t('register.createAccount')}</Button>
          </>
        )}
      </form>
    </main>
  );
}
