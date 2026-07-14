import { useEffect, useState } from 'react';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { NexusLoader } from '../../../shared/ui/NexusLoader.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { uploadAvatar } from '../../chats/api/uploadApi.js';
import { getMyProfile, updateMyProfile, updateUsername } from '../api/userApi.js';

const BUILT_IN_AVATARS = Array.from({ length: 20 }, (_, index) => `animal-${String(index + 1).padStart(2, '0')}`);
const AVATAR_EMOJIS = ['🦊', '🐼', '🐯', '🦁', '🐨', '🐸', '🐵', '🐧', '🦉', '🐺', '🐰', '🦄', '🐙', '🐢', '🦋', '🐝', '🦕', '🐬', '🦭', '🐿️'];
const AVATAR_MAX_SIZE_BYTES = 50 * 1024 * 1024;

function avatarEmoji(avatarRef) {
  const index = BUILT_IN_AVATARS.indexOf(avatarRef || 'animal-01');
  return AVATAR_EMOJIS[index >= 0 ? index : 0];
}

function AvatarView({ profile, previewUrl, size = 'large' }) {
  if (previewUrl || profile?.avatar_type === 'uploaded') {
    return <img className={`avatar ${size} avatar-image`} src={previewUrl || profile?.avatar_ref} alt="" aria-hidden="true" />;
  }
  return <div className={`avatar ${size} avatar-emoji`} aria-hidden="true">{avatarEmoji(profile?.avatar_ref)}</div>;
}

export function ProfilePage() {
  const { t } = useI18n();
  const { session, saveSession } = useSession();
  const [user, setUser] = useState(session.user);
  const [form, setForm] = useState({ display_name: '', username: '', optional_phone: '', phone_public: false, avatar_type: 'built_in', avatar_ref: 'animal-01' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const { disableNotifications, enableNotifications, isEnabled: notificationsEnabled, isSupported, permission: notificationPermission } = useNotifications();
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
          optional_phone: result.profile?.optional_phone ?? '',
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
        optional_phone: form.optional_phone,
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

  async function handleNotificationsToggle(event) {
    const nextEnabled = event.target.checked;
    if (!nextEnabled) {
      await disableNotifications();
      setStatus(t('profile.notificationsDisabled'));
      return;
    }

    if (!isSupported) {
      setStatus(t('profile.notificationsUnsupported'));
      return;
    }

    const result = await enableNotifications();
    if (result.status === 'granted') {
      setStatus(t('profile.notificationsEnabled'));
      return;
    }

    setStatus(result.status === 'denied' ? t('profile.notificationsDenied') : result.status === 'unconfigured' ? t('profile.notificationsUnavailable') : t('profile.notificationsNotEnabled'));
  }

  return (
    <form className="panel readable" onSubmit={handleSave}>
      <h1>{t('profile.title')}</h1>
      {isLoading ? <NexusLoader compact title={t('profile.loadingTitle')} text={t('profile.loadingText')} /> : null}
      <div className="profile-card">
        <AvatarView profile={{ ...user?.profile, avatar_type: form.avatar_type, avatar_ref: form.avatar_ref }} previewUrl={avatarPreview} />
        <div>
          <p className="muted">{t('profile.displayNameLabel')}</p>
          <h2>{user?.profile?.display_name ?? 'Nexus User'}</h2>
          <p className="muted">@{user?.profile?.username ?? 'nexus'}</p>
        </div>
      </div>
      <section className="avatar-picker profile-avatar-picker" aria-label={t('profile.avatarTitle')}>
        <div className="avatar-picker-head">
          <div>
            <h2>{t('profile.avatarTitle')}</h2>
            <p className="muted">{t('profile.avatarText')}</p>
          </div>
          <AvatarView profile={{ avatar_type: form.avatar_type, avatar_ref: form.avatar_ref }} previewUrl={avatarPreview} />
        </div>
        <div className="avatar-grid compact-avatar-grid">
          {BUILT_IN_AVATARS.map((avatarRef, index) => (
            <button className={`avatar-choice ${form.avatar_type === 'built_in' && form.avatar_ref === avatarRef ? 'active' : ''}`} type="button" key={avatarRef} onClick={() => selectBuiltInAvatar(avatarRef)}>
              <span aria-hidden="true">{AVATAR_EMOJIS[index]}</span>
            </button>
          ))}
        </div>
        <label className="avatar-upload">
          <span>{avatarFile ? avatarFile.name : t('profile.uploadAvatar')}</span>
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => handleAvatarFile(event.target.files?.[0])} />
        </label>
      </section>
      <div className="info-card halo-outline">
        <span>Nexus ID</span>
        <strong>{user?.nexus_id ?? '0000000000000000'}</strong>
      </div>
      <section className="info-card notification-profile-card">
        <div>
          <strong>{t('profile.notificationsTitle')}</strong>
          <p className="muted">{t('profile.notificationsText')}</p>
        </div>
        <label className="switch-row">
          <span className={`settings-status-pill ${notificationsEnabled && notificationPermission === 'granted' ? 'granted' : 'default'}`}>
            {notificationsEnabled && notificationPermission === 'granted' ? t('settings.notificationStatus.granted') : t('settings.notificationStatus.default')}
          </span>
          <input type="checkbox" checked={notificationsEnabled && notificationPermission === 'granted'} onChange={handleNotificationsToggle} disabled={!isSupported || notificationPermission === 'denied'} />
        </label>
      </section>
      <TextInput label={t('profile.name')} value={form.display_name} onChange={(event) => updateField('display_name', event.target.value)} />
      <TextInput label="Username" value={form.username} onChange={(event) => updateField('username', event.target.value)} />
      <TextInput label={t('profile.optionalPhone')} value={form.optional_phone} onChange={(event) => updateField('optional_phone', event.target.value)} />
      <label className="field inline-field">
        <span>{t('profile.phonePublic')}</span>
        <input type="checkbox" checked={form.phone_public} onChange={(event) => updateField('phone_public', event.target.checked)} />
      </label>
      {status ? <p className="muted">{status}</p> : null}
      <Button type="submit">{t('profile.save')}</Button>
    </form>
  );
}
