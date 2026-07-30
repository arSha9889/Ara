import { useEffect, useState } from 'react';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { getPublicUser } from '../api/userApi.js';

export function PublicProfileSheet({ user, isOpen, onClose, onWrite, isWriting = false, presence }) {
  const { t } = useI18n();
  const { session } = useSession();
  const [profile, setProfile] = useState(user);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const username = user?.profile?.username || user?.username;

  useEffect(() => {
    setProfile(user);
    setError('');
  }, [user]);

  useEffect(() => {
    if (!isOpen || !username) return undefined;
    let active = true;
    setIsLoading(true);
    getPublicUser(session.accessToken, username)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [isOpen, session.accessToken, username]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;
  const publicProfile = profile?.profile || profile;
  const displayName = publicProfile?.display_name || publicProfile?.username || 'AraChat';
  const publicPhone = publicProfile?.optional_phone;

  return (
    <div className="public-profile-layer" role="presentation" onMouseDown={onClose}>
      <aside className="public-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="public-profile-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="public-profile-sheet-glow" aria-hidden="true" />
        <div className="public-profile-sheet-handle" aria-hidden="true" />
        <button className="public-profile-close" type="button" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="x" size={19} />
        </button>
        <div className="public-profile-identity">
          <div className="public-profile-avatar-wrap">
            <UserAvatar profile={publicProfile} fallback={displayName[0] || 'A'} size="large" />
            {presence?.tone === 'online' ? <span className="public-profile-online" aria-hidden="true" /> : null}
          </div>
          <div>
            <p className="eyebrow">AraChat</p>
            <h2 id="public-profile-title">{displayName}</h2>
            <p>@{publicProfile?.username}</p>
            {profile?.is_official || user?.is_official ? <span className="public-profile-official"><Icon name="check" size={14} />{t('chats.officialAccount')}</span> : null}
          </div>
        </div>
        <div className="public-profile-details">
          {presence?.label ? <div className="public-profile-detail"><Icon name="activity" size={18} /><div><span>{t('chats.presence')}</span><strong>{presence.label}</strong></div></div> : null}
          {publicPhone ? <div className="public-profile-detail"><Icon name="phone" size={18} /><div><span>{t('chats.publicPhone')}</span><strong>{publicPhone}</strong></div></div> : null}
          {!isLoading && !publicPhone ? <p className="public-profile-private-note"><Icon name="shield" size={17} />{t('chats.profilePrivate')}</p> : null}
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        {onWrite ? <button className="button button-primary public-profile-write" type="button" onClick={onWrite} disabled={isWriting}><Icon name="chat" size={18} />{isWriting ? t('chats.openingChat') : t('chats.newChatWrite')}</button> : null}
      </aside>
    </div>
  );
}
