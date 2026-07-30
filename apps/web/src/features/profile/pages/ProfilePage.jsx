import { useEffect, useState } from 'react';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { BUILT_IN_AVATARS, AVATAR_EMOJIS, UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { uploadAvatar } from '../../chats/api/uploadApi.js';
import { getMyProfile, updateMyProfile, updateUsername } from '../api/userApi.js';

const AVATAR_MAX_SIZE_BYTES = 50 * 1024 * 1024;

export function ProfilePage() {
  const { t } = useI18n();
  const { session, saveSession } = useSession();
  const [user, setUser] = useState(session.user);
  const [form, setForm] = useState({ display_name: '', username: '', email: '', phone_public: false, avatar_type: 'built_in', avatar_ref: 'animal-01' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isIdCopied, setIsIdCopied] = useState(false);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(!session.user);

  useEffect(() => {
    async function loadProfile() {
      try {
        setIsLoading(true);
        const result = await getMyProfile(session.accessToken);
        setUser(result);
        setForm({
          display_name: result.profile?.display_name ?? '',
          username: result.profile?.username ?? '',
          email: result.profile?.email ?? '',
          phone_public: Boolean(result.profile?.phone_public),
          avatar_type: result.profile?.avatar_type ?? 'built_in',
          avatar_ref: result.profile?.avatar_ref ?? 'animal-01',
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile().catch((err) => setStatus(err.message));
  }, [session.accessToken]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSave(event) {
    event.preventDefault();
    setStatus(t('profile.saving'));
    try {
      let avatarPayload = {
        avatar_type: form.avatar_type,
        avatar_ref: form.avatar_ref,
      };
      if (avatarFile) {
        const uploaded = await uploadAvatar(session.accessToken, avatarFile);
        avatarPayload = { avatar_type: 'uploaded', avatar_ref: uploaded.media_url };
      }
        let nextUser = await updateMyProfile(session.accessToken, {
          display_name: form.display_name,
          email: form.email,
          phone_public: form.phone_public,
        ...avatarPayload,
      });
      if (form.username && form.username !== user.profile?.username) {
        nextUser = await updateUsername(session.accessToken, form.username);
      }
      setUser(nextUser);
      setAvatarFile(null);
      setAvatarPreview('');
      setForm((current) => ({
        ...current,
        avatar_type: nextUser.profile?.avatar_type ?? current.avatar_type,
        avatar_ref: nextUser.profile?.avatar_ref ?? current.avatar_ref,
      }));
      saveSession({ ...session, user: nextUser });
      setStatus(t('profile.saved'));
    } catch (err) {
      setStatus(err.message);
    }
  }

  function selectBuiltInAvatar(avatarRef) {
    setAvatarFile(null);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview('');
    setForm((current) => ({ ...current, avatar_type: 'built_in', avatar_ref: avatarRef }));
  }

  function handleAvatarFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus(t('profile.avatarImageOnly'));
      return;
    }
    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      setStatus(t('profile.avatarTooLarge'));
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setForm((current) => ({ ...current, avatar_type: 'uploaded', avatar_ref: current.avatar_ref }));
  }

  async function handleCopyId() {
    const id = user?.nexus_id;
    if (!id) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        const input = document.createElement('textarea');
        input.value = id;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error(t('profile.copyIdError'));
      }

      setIsIdCopied(true);
      window.setTimeout(() => setIsIdCopied(false), 1800);
    } catch (err) {
      setStatus(err.message || t('profile.copyIdError'));
    }
  }

  return (
    <form className="panel profile-page" onSubmit={handleSave}>
      {isLoading ? <AraChatLoader compact title={t('profile.loadingTitle')} text={t('profile.loadingText')} /> : null}
      <header className="profile-hero">
        <div className="profile-hero-identity">
          <UserAvatar profile={{ ...user?.profile, avatar_type: form.avatar_type, avatar_ref: form.avatar_ref }} previewUrl={avatarPreview} size="large" />
          <div>
            <p className="eyebrow">AraChat</p>
            <h1>{user?.profile?.display_name ?? 'AraChat User'}</h1>
            <p className="muted">@{user?.profile?.username ?? 'arachat'}</p>
          </div>
        </div>
        <div className="profile-id-card">
          <span>AraChat ID</span>
          <strong>{user?.nexus_id ?? '0000000000000000'}</strong>
          <button className={`profile-id-copy ${isIdCopied ? 'copied' : ''}`} type="button" onClick={handleCopyId} aria-label={t('profile.copyId')} title={t('profile.copyId')}>
            <Icon name={isIdCopied ? 'check' : 'copy'} size={18} />
          </button>
        </div>
      </header>
      <section className="profile-editor-section profile-avatar-section" aria-label={t('profile.avatarTitle')}>
        <div className="profile-section-heading">
          <div>
            <h2>{t('profile.avatarTitle')}</h2>
            <p className="muted">{t('profile.avatarText')}</p>
          </div>
          <button className="avatar-preview" type="button" onClick={() => setIsAvatarPickerOpen((current) => !current)} aria-expanded={isAvatarPickerOpen} aria-label={t('profile.avatarTitle')}>
            {avatarPreview ? <img src={avatarPreview} alt="" /> : <UserAvatar profile={{ avatar_type: form.avatar_type, avatar_ref: form.avatar_ref }} size="large" />}
            <span className="avatar-preview-edit" aria-hidden="true"><Icon name="pencil" size={13} /></span>
          </button>
        </div>
        {isAvatarPickerOpen ? (
          <div className="avatar-options-panel">
            <label className="avatar-upload">
              <span className="avatar-upload-icon" aria-hidden="true"><Icon name="plus" size={20} /></span>
              <span className="avatar-upload-copy">
                <strong>{avatarFile ? avatarFile.name : t('profile.uploadAvatar')}</strong>
                <small>PNG, JPG, GIF, WebP</small>
              </span>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => handleAvatarFile(event.target.files?.[0])} />
            </label>
            <div className="avatar-grid compact-avatar-grid">
              {BUILT_IN_AVATARS.map((avatarRef, index) => (
                <button className={`avatar-choice ${form.avatar_type === 'built_in' && form.avatar_ref === avatarRef ? 'active' : ''}`} type="button" key={avatarRef} onClick={() => selectBuiltInAvatar(avatarRef)} aria-pressed={form.avatar_type === 'built_in' && form.avatar_ref === avatarRef}>
                  <span aria-hidden="true">{AVATAR_EMOJIS[index]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <section className="profile-editor-section">
        <div className="profile-section-heading">
          <div>
            <h2>{t('profile.title')}</h2>
            <p className="muted">{t('profile.displayNameLabel')}</p>
          </div>
        </div>
        <div className="profile-fields-grid">
          <TextInput label={t('profile.name')} value={form.display_name} onChange={(event) => updateField('display_name', event.target.value)} />
          <TextInput label="Username" value={form.username} onChange={(event) => updateField('username', event.target.value)} />
          <TextInput label={t('profile.email')} type="email" inputMode="email" autoComplete="email" placeholder={t('profile.emailPlaceholder')} value={form.email} onChange={(event) => updateField('email', event.target.value)} />
        </div>
        {user?.profile?.optional_phone ? <div className="profile-phone-card"><span>{t('profile.optionalPhone')}</span><strong>{user.profile.optional_phone}</strong></div> : null}
        <label className="field inline-field profile-visibility-row">
          <span>{t('profile.phonePublic')}</span>
          <input type="checkbox" checked={form.phone_public} onChange={(event) => updateField('phone_public', event.target.checked)} />
        </label>
      </section>
      {status ? <p className="muted">{status}</p> : null}
      <Button type="submit">{t('profile.save')}</Button>
    </form>
  );
}
