import { useEffect, useState } from 'react';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { getCurrentUser, updateCurrentProfile } from '../../features/users/usersApi.js';

const USERNAME_PATTERN = /^[a-zA-Z0-9]{3,32}$/;

function initials(displayName) {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function ProfilePanel({ accessToken, t }) {
  const [user, setUser] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setError('');

    getCurrentUser(accessToken)
      .then((currentUser) => {
        if (isCurrent) setUser(currentUser);
      })
      .catch((requestError) => {
        if (isCurrent) setError(requestError.message);
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [accessToken]);

  function update(name, value) {
    setUser((current) => current?.profile
      ? { ...current, profile: { ...current.profile, [name]: value } }
      : current);
    setFeedback('');
    setError('');
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!user?.profile?.display_name.trim()) {
      setError(t('workspace.profilePanel.nameError'));
      return;
    }
    if (!USERNAME_PATTERN.test(user.profile.username)) {
      setError(t('workspace.profilePanel.usernameError'));
      return;
    }
    setIsSaving(true);
    setError('');
    setFeedback('');
    try {
      const updatedUser = await updateCurrentProfile(accessToken, {
        display_name: user.profile.display_name.trim(),
        username: user.profile.username,
      });
      setUser(updatedUser);
      setFeedback(t('workspace.profilePanel.saved'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  const profile = user?.profile;
  const displayName = profile?.display_name ?? '';
  const username = profile?.username ?? '';

  return (
    <section className="workspace-detail-panel workspace-profile-panel" aria-labelledby="profile-title">
      <header className="workspace-panel-heading">
        <div>
          <p>{t('workspace.profilePanel.kicker')}</p>
          <h1 id="profile-title">{t('workspace.profilePanel.title')}</h1>
          <span>{t('workspace.profilePanel.intro')}</span>
        </div>
        <span className="workspace-panel-icon"><Icon name="profile" size={25} /></span>
      </header>

      <div className="profile-identity-card">
        <span className="profile-avatar" aria-hidden="true">{initials(displayName) || 'AR'}</span>
        <div className="profile-identity-copy">
          <strong>{displayName || t('workspace.profilePanel.defaultName')}</strong>
          <span>@{username || '—'}</span>
        </div>
        <div className="profile-server-mark"><span aria-hidden="true" />{t('workspace.profilePanel.serverMark')}</div>
      </div>

      <form className="profile-editor" onSubmit={saveProfile} noValidate>
        <div className="workspace-section-card">
          <div className="workspace-section-heading">
            <div><h2>{t('workspace.profilePanel.personalTitle')}</h2><p>{t('workspace.profilePanel.personalText')}</p></div>
          </div>
          <div className="profile-fields-grid">
            <label className="workspace-field">
              <span>{t('workspace.profilePanel.displayName')}</span>
              <input value={displayName} onChange={(event) => update('display_name', event.target.value)} maxLength="80" autoComplete="name" disabled={isLoading || isSaving} />
            </label>
            <label className="workspace-field">
              <span>{t('workspace.profilePanel.username')}</span>
              <div className="workspace-input-prefix"><span>@</span><input value={username} onChange={(event) => update('username', event.target.value.replace(/\s/g, ''))} maxLength="32" autoComplete="username" spellCheck="false" disabled={isLoading || isSaving} /></div>
              <small>{t('workspace.profilePanel.usernameHint')}</small>
            </label>
          </div>
        </div>

        <div className="workspace-section-card profile-id-card">
          <div className="workspace-section-heading">
            <div><h2>{t('workspace.profilePanel.idTitle')}</h2><p>{t('workspace.profilePanel.idText')}</p></div>
            <span className="workspace-section-icon"><Icon name="shield" size={18} /></span>
          </div>
          <strong className="profile-arachat-id">{user?.nexus_id ?? '—'}</strong>
          <small>{t('workspace.profilePanel.idNotice')}</small>
        </div>

        {error ? <p className="workspace-form-notice is-error" role="alert">{error}</p> : null}
        {feedback ? <p className="workspace-form-notice" role="status"><Icon name="check" size={16} />{feedback}</p> : null}
        <button className="workspace-primary-button" type="submit" disabled={isLoading || isSaving || !profile}><Icon name="save" size={17} />{isLoading ? t('workspace.profilePanel.loading') : isSaving ? t('workspace.profilePanel.saving') : t('workspace.profilePanel.save')}</button>
      </form>
    </section>
  );
}
