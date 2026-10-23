import { useCallback, useEffect, useRef, useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import {
  deletePrivateChannel,
  generateChannelInvite,
  getChat,
  getChannelInviteState,
  getChannelMembers,
  leavePrivateChannel,
  removeChannelMember,
  revokeChannelInvite,
  updateChannelMemberRole,
  updateChannelNotifications,
  updatePrivateChannel,
  uploadChannelAvatar,
} from '../../features/chats/chatsApi.js';
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';

function initials(value) {
  return (value || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Clipboard is unavailable');
}

export function ChannelDetailsPanel({ accessToken, channel, currentUserId, onBack, onDeleted, onLeave, onUpdated, t }) {
  const [title, setTitle] = useState(channel.title || '');
  const [description, setDescription] = useState(channel.description || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [members, setMembers] = useState([]);
  const [inviteActive, setInviteActive] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(channel.notifications_enabled !== false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const avatarInputRef = useRef(null);
  const isPrivate = Boolean(channel.is_private);
  const role = channel.current_role;
  const canManage = isPrivate && ['owner', 'admin'].includes(role);
  const isOwner = role === 'owner';
  const avatarUrl = mediaUrlForDesktop(channel.avatar_ref);

  const loadManagementData = useCallback(async () => {
    if (!canManage) return;
    setIsLoading(true);
    setError('');
    try {
      const [inviteState, memberList] = await Promise.all([
        getChannelInviteState(accessToken, channel.id),
        getChannelMembers(accessToken, channel.id),
      ]);
      setInviteActive(Boolean(inviteState?.is_active));
      setMembers(Array.isArray(memberList) ? memberList : []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, canManage, channel.id]);

  useEffect(() => {
    setTitle(channel.title || '');
    setDescription(channel.description || '');
    setAvatarFile(null);
    setNotificationsEnabled(channel.notifications_enabled !== false);
  }, [channel]);

  useEffect(() => {
    void loadManagementData();
  }, [loadManagementData]);

  async function saveChannel(event) {
    event.preventDefault();
    if (isSaving || !canManage) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim() };
      if (avatarFile) {
        const avatar = await uploadChannelAvatar(accessToken, avatarFile);
        payload.avatar_ref = avatar.media_url;
      }
      const updated = await updatePrivateChannel(accessToken, channel.id, payload);
      setAvatarFile(null);
      onUpdated?.(updated);
      setNotice(t('workspace.channels.channelSaved'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleNotifications() {
    if (isSaving || !channel.is_subscribed) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const updated = await updateChannelNotifications(accessToken, channel.id, !notificationsEnabled);
      setNotificationsEnabled(updated.notifications_enabled !== false);
      onUpdated?.(updated);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function createInvite() {
    if (isSaving) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const invite = await generateChannelInvite(accessToken, channel.id);
      setInviteLink(invite.invite_link || '');
      setInviteActive(true);
      setNotice(t('workspace.channels.inviteGenerated'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    setError('');
    try {
      await copyText(inviteLink);
      setNotice(t('workspace.channels.inviteCopied'));
    } catch (copyError) {
      setError(copyError.message || t('workspace.channels.copyInviteError'));
    }
  }

  async function revokeInvite() {
    if (isSaving || !inviteActive || !window.confirm(t('workspace.channels.revokeInviteConfirm'))) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await revokeChannelInvite(accessToken, channel.id);
      setInviteActive(false);
      setInviteLink('');
      setNotice(t('workspace.channels.inviteRevoked'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshMembers() {
    await loadManagementData();
  }

  async function changeRole(member, nextRole) {
    if (isSaving || member.role === nextRole) return;
    const confirmationKey = nextRole === 'owner' ? 'workspace.channels.transferOwnershipConfirm' : null;
    if (confirmationKey && !window.confirm(t(confirmationKey, { member: member.display_name || member.username }))) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await updateChannelMemberRole(accessToken, channel.id, member.user_id, nextRole);
      setNotice(nextRole === 'owner' ? t('workspace.channels.ownershipTransferred') : t('workspace.channels.memberRoleUpdated'));
      await refreshMembers();
      onUpdated?.(await getChat(accessToken, channel.id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeMember(member) {
    if (isSaving || !window.confirm(t('workspace.channels.removeMemberConfirm', { member: member.display_name || member.username }))) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await removeChannelMember(accessToken, channel.id, member.user_id);
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      setNotice(t('workspace.channels.memberRemoved'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function leaveChannel() {
    if (isSaving) return;
    if (role === 'owner') {
      setError(t('workspace.channels.ownerLeaveRestricted'));
      return;
    }
    if (!window.confirm(t('workspace.channels.leaveConfirm'))) return;
    setError('');
    setIsSaving(true);
    try {
      await leavePrivateChannel(accessToken, channel.id);
      await onLeave?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteChannel() {
    if (isSaving || !isPrivate || !isOwner || !window.confirm(t('workspace.channels.deleteChannelConfirm', { channel: channel.title }))) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await deletePrivateChannel(accessToken, channel.id);
      await onDeleted?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return <section className="workspace-chat-panel channel-details-panel" aria-labelledby="channel-details-title">
    <header className="chat-header">
      <AraButton className="chat-back-button" type="button" onClick={onBack} size="compact" variant="ghost"><Icon name="arrow-left" size={18} />{t('workspace.channels.backToPosts')}</AraButton>
      <div className="channel-details-title"><h1 id="channel-details-title">{t('workspace.channels.channelInfo')}</h1><span>{channel.title}</span></div>
      {canManage ? <AraButton className="channel-header-action" type="button" title={t('workspace.channels.refreshManagement')} aria-label={t('workspace.channels.refreshManagement')} onClick={() => void loadManagementData()} disabled={isLoading || isSaving} size="icon" variant="ghost"><Icon name="refresh" size={18} /></AraButton> : null}
    </header>

    <div className="channel-details-content">
      {error ? <div className="workspace-list-error" role="alert"><strong>{t('workspace.channels.operationError')}</strong><span>{error}</span></div> : null}
      {notice ? <p className="workspace-list-notice" role="status">{notice}</p> : null}
      <section className="workspace-section-card channel-info-card">
        <div className="channel-details-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(channel.title)}</div>
        <div><h2>{channel.title}</h2><p>{channel.description || t('workspace.channels.noDescription')}</p><span>{channel.is_private ? t('workspace.channels.privateChannel') : t('workspace.channels.publicChannel')} · {t('workspace.channels.subscribersCount', { count: channel.subscriber_count || 0 })}</span></div>
      </section>

      {canManage ? <form className="workspace-section-card channel-details-form" onSubmit={saveChannel}>
        <div className="workspace-section-heading"><div><h2>{t('workspace.channels.editChannel')}</h2><p>{t('workspace.channels.editChannelHint')}</p></div></div>
        <label><span>{t('workspace.channels.titleLabel')}</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength="2" maxLength="120" required /></label>
        <label><span>{t('workspace.channels.descriptionLabel')}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" rows="3" /></label>
        <input className="sr-only" ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,image/avif" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
        <div className="channel-avatar-upload"><span><Icon name="image" size={18} /></span><div><strong>{t('workspace.channels.avatarLabel')}</strong><small>{avatarFile?.name || t('workspace.channels.keepAvatar')}</small></div><AraButton type="button" onClick={() => avatarInputRef.current?.click()} size="compact" variant="ghost">{t('workspace.channels.chooseAvatar')}</AraButton></div>
        <AraButton type="submit" variant="primary" disabled={isSaving || title.trim().length < 2}>{isSaving ? t('workspace.channels.savingChannel') : t('workspace.channels.saveChannel')}</AraButton>
      </form> : null}

      {canManage ? <section className="workspace-section-card channel-invite-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.channels.inviteTitle')}</h2><p>{inviteActive ? t('workspace.channels.inviteActive') : t('workspace.channels.inviteInactive')}</p></div></div>
        {inviteLink ? <div className="channel-invite-link"><code>{inviteLink}</code><AraButton type="button" onClick={() => void copyInvite()} size="compact" variant="secondary"><Icon name="link" size={15} />{t('workspace.channels.copyInvite')}</AraButton></div> : null}
        <div className="channel-inline-actions"><AraButton type="button" variant="primary" onClick={() => void createInvite()} disabled={isSaving}>{inviteActive ? t('workspace.channels.regenerateInvite') : t('workspace.channels.generateInvite')}</AraButton>{inviteActive ? <AraButton type="button" variant="secondary" onClick={() => void revokeInvite()} disabled={isSaving}>{t('workspace.channels.revokeInvite')}</AraButton> : null}</div>
      </section> : null}

      {canManage ? <section className="workspace-section-card channel-members-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.channels.membersTitle')}</h2><p>{t('workspace.channels.membersHint')}</p></div><span>{members.length}</span></div>
        {isLoading ? <p className="channel-empty" role="status">{t('workspace.channels.loadingMembers')}</p> : <div className="channel-member-list">{members.map((member) => {
          const isCurrentUser = String(member.user_id) === String(currentUserId);
          const canChangeRole = isOwner && member.role !== 'owner' && !isCurrentUser;
          const canRemove = !isCurrentUser && member.role !== 'owner' && (isOwner || (role === 'admin' && member.role === 'member'));
          return <article className="channel-member" key={member.user_id}>
            <span className="channel-member-avatar">{mediaUrlForDesktop(member.avatar_ref) ? <img src={mediaUrlForDesktop(member.avatar_ref)} alt="" /> : initials(member.display_name || member.username)}</span>
            <div><strong>{member.display_name || member.username}</strong><small>{member.username ? `@${member.username}` : t(`workspace.channels.role${member.role[0].toUpperCase()}${member.role.slice(1)}`)}</small></div>
            {canChangeRole ? <select value={member.role} onChange={(event) => void changeRole(member, event.target.value)} disabled={isSaving} aria-label={t('workspace.channels.memberRoleLabel', { member: member.display_name || member.username })}><option value="member">{t('workspace.channels.roleMember')}</option><option value="admin">{t('workspace.channels.roleAdmin')}</option><option value="owner">{t('workspace.channels.roleOwner')}</option></select> : <span className="channel-member-role">{t(`workspace.channels.role${member.role[0].toUpperCase()}${member.role.slice(1)}`)}</span>}
            {canRemove ? <AraButton className="channel-member-remove" type="button" aria-label={t('workspace.channels.removeMemberLabel', { member: member.display_name || member.username })} title={t('workspace.channels.removeMember')} onClick={() => void removeMember(member)} disabled={isSaving} size="icon" variant="ghost"><Icon name="trash" size={15} /></AraButton> : null}
          </article>;
        })}</div>}
      </section> : null}

      {channel.is_subscribed ? <section className="workspace-section-card channel-preferences-card"><div><h2>{t('workspace.channels.notificationsTitle')}</h2><p>{t('workspace.channels.notificationsHint')}</p></div><button className={`channel-notification-toggle ${notificationsEnabled ? 'is-enabled' : ''}`} type="button" role="switch" aria-checked={notificationsEnabled} onClick={() => void toggleNotifications()} disabled={isSaving}><span>{notificationsEnabled ? t('workspace.channels.notificationsOn') : t('workspace.channels.notificationsOff')}</span><i /></button></section> : null}

      {isPrivate && !isOwner ? <section className="channel-leave-card"><div><h2>{t('workspace.channels.leaveTitle')}</h2><p>{t('workspace.channels.leaveHint')}</p></div><AraButton type="button" onClick={() => void leaveChannel()} disabled={isSaving} variant="secondary">{t('workspace.channels.leaveChannel')}</AraButton></section> : null}
      {isPrivate && isOwner ? <section className="channel-delete-card"><div><h2>{t('workspace.channels.deleteTitle')}</h2><p>{t('workspace.channels.deleteHint')}</p></div><AraButton type="button" onClick={() => void deleteChannel()} disabled={isSaving} variant="secondary">{isSaving ? t('workspace.channels.deletingChannel') : t('workspace.channels.deleteChannel')}</AraButton></section> : null}
    </div>
  </section>;
}
