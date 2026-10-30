import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';

const AVATAR_TONES = ['violet', 'coral', 'yellow', 'blue'];

function initials(value) {
  return (value || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function avatarTone(value) {
  const total = [...String(value || '')].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return AVATAR_TONES[total % AVATAR_TONES.length];
}

function chatMeta(chat, t) {
  if (chat.type === 'direct') {
    const peer = chat.peer;
    if (peer?.is_online) return t('workspace.chatInspector.online');
    if (peer?.username) return `@${peer.username}`;
    return t('workspace.chatPanel.directChat');
  }

  if (chat.type === 'group') return t('workspace.groups.membersCount', { count: chat.participant_ids?.length || 0 });
  return t('workspace.channels.subscribersCount', { count: chat.subscriber_count || 0 });
}

function chatDescription(chat, t) {
  if (chat.type === 'direct') return chat.peer?.username ? `@${chat.peer.username}` : t('workspace.chatPanel.directChat');
  return chat.description || (chat.type === 'group' ? t('workspace.groups.noDescription') : t('workspace.channels.noDescription'));
}

export function WorkspaceChatDetails({ canStartCall, chat, onOpenDetails, onStartCall, t }) {
  const peer = chat.type === 'direct' ? chat.peer : null;
  const title = peer?.display_name || peer?.username || chat.title || t('workspace.unknownUser');
  const avatarUrl = mediaUrlForDesktop(peer?.avatar_ref || chat.avatar_ref);
  const canManage = chat.type === 'group' || chat.type === 'branch';

  return (
    <aside className="workspace-chat-details" aria-label={t('workspace.chatInspector.label', { title })}>
      <section className="chat-details-hero">
        <div className="chat-details-cover" aria-hidden="true"><span /><span /><span /></div>
        <span className={`workspace-avatar workspace-avatar-large chat-details-avatar is-${avatarTone(peer?.id || chat.id)}`}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(title)}
        </span>
        <div className="chat-details-copy">
          <h2>{title}</h2>
          <p>{chatMeta(chat, t)}</p>
        </div>
      </section>

      <div className="chat-details-actions" aria-label={t('workspace.chatInspector.actions')}>
        {chat.type === 'direct' ? <>
          <AraButton aria-label={t('workspace.chatPanel.startAudio')} disabled={!canStartCall} onClick={() => void onStartCall?.(chat, 'audio')} size="icon" title={t('workspace.chatPanel.startAudio')} variant="ghost"><Icon name="calls" size={18} /></AraButton>
          <AraButton aria-label={t('workspace.chatPanel.startVideo')} disabled={!canStartCall} onClick={() => void onStartCall?.(chat, 'video')} size="icon" title={t('workspace.chatPanel.startVideo')} variant="ghost"><Icon name="video" size={18} /></AraButton>
        </> : null}
        {canManage ? <AraButton aria-label={t('workspace.chatInspector.openDetails')} onClick={onOpenDetails} size="icon" title={t('workspace.chatInspector.openDetails')} variant="ghost"><Icon name="settings" size={18} /></AraButton> : null}
      </div>

      <section className="chat-details-section">
        <h3>{t('workspace.chatInspector.about')}</h3>
        <p>{chatDescription(chat, t)}</p>
      </section>

      {chat.type === 'direct' ? <section className="chat-details-section chat-details-security">
        <Icon name="shield" size={17} />
        <div><h3>{t('workspace.chatInspector.privacy')}</h3><p>{t('workspace.chatInspector.privacyText')}</p></div>
      </section> : <section className="chat-details-section chat-details-members">
        <div><h3>{chat.type === 'group' ? t('workspace.groups.membersTitle') : t('workspace.channels.subscribersCount', { count: chat.subscriber_count || 0 })}</h3><p>{chatMeta(chat, t)}</p></div>
        <AraButton onClick={onOpenDetails} size="compact" variant="secondary">{t('workspace.chatInspector.view')}</AraButton>
      </section>}
    </aside>
  );
}
