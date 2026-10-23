import { useCallback, useEffect, useRef, useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import {
  addGroupMember,
  deleteGroup,
  generateGroupInvite,
  getChat,
  getGroupInviteState,
  getGroupMembers,
  leaveGroup,
  removeGroupMember,
  revokeGroupInvite,
  transferGroupOwnership,
  updateGroup,
  updateGroupMemberRole,
  uploadGroupAvatar,
} from '../../features/chats/chatsApi.js';
import { searchPublicUsers } from '../../features/users/usersApi.js';
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';

function initials(value) {
  return (value || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function memberName(member) {
  return member?.display_name || member?.username || '';
}

function profileForUser(user) {
  return user?.profile || user || null;
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

export function GroupDetailsPanel({ accessToken, currentUserId, group, onBack, onDeleted, onLeave, onUpdated, t }) {
  const [title, setTitle] = useState(group.title || '');
  const [description, setDescription] = useState(group.description || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [members, setMembers] = useState([]);
  const [inviteActive, setInviteActive] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [ownershipRecipientId, setOwnershipRecipientId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const avatarInputRef = useRef(null);
  const role = group.current_role;
  const isOwner = role === 'owner';
  const canManage = ['owner', 'admin'].includes(role);
  const managementVersion = [
    role,
    group.last_message_id,
    ...(group.participant_ids || []).map((memberId) => String(memberId)).sort(),
  ].join(':');
  const avatarUrl = mediaUrlForDesktop(group.avatar_ref);

  const loadManagementData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const requests = [getGroupMembers(accessToken, group.id)];
      if (canManage) requests.push(getGroupInviteState(accessToken, group.id));
      const [memberList, inviteState] = await Promise.all(requests);
      setMembers(Array.isArray(memberList) ? memberList : []);
      setInviteActive(Boolean(inviteState?.is_active));
      if (!inviteState?.is_active) setInviteLink('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, canManage, group.id, managementVersion]);

  useEffect(() => {
    setTitle(group.title || '');
    setDescription(group.description || '');
    setAvatarFile(null);
  }, [group]);

  useEffect(() => {
    void loadManagementData();
  }, [loadManagementData]);

  async function refreshGroup() {
    const updated = await getChat(accessToken, group.id);
    onUpdated?.(updated);
    return updated;
  }

  async function saveGroup(event) {
    event.preventDefault();
    if (isSaving || !isOwner) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim() };
      if (avatarFile) {
        const avatar = await uploadGroupAvatar(accessToken, avatarFile);
        payload.avatar_ref = avatar.media_url;
      }
      const updated = await updateGroup(accessToken, group.id, payload);
      setAvatarFile(null);
      onUpdated?.(updated);
      setNotice(t('workspace.groups.groupSaved'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function searchMembers(event) {
    event.preventDefault();
    const query = memberQuery.trim();
    setError('');
    if (!query) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const users = await searchPublicUsers(accessToken, query);
      const participantIds = new Set(members.map((member) => String(member.user_id)));
      setSearchResults((Array.isArray(users) ? users : []).filter((user) => String(user.id) !== String(currentUserId) && !participantIds.has(String(user.id))));
      setHasSearched(true);
    } catch (requestError) {
      setSearchResults([]);
      setHasSearched(true);
      setError(requestError.message);
    } finally {
      setIsSearching(false);
    }
  }

  async function addMember(user) {
    if (!user?.id || isSaving || !canManage) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const updated = await addGroupMember(accessToken, group.id, user.id);
      onUpdated?.(updated);
      setMemberQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setNotice(t('workspace.groups.memberAdded'));
      await loadManagementData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function createInvite() {
    if (isSaving || !canManage) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const invite = await generateGroupInvite(accessToken, group.id);
      setInviteLink(invite.invite_link || '');
      setInviteActive(true);
      setNotice(t('workspace.groups.inviteGenerated'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function revokeInvite() {
    if (isSaving || !inviteActive || !window.confirm(t('workspace.groups.revokeInviteConfirm'))) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await revokeGroupInvite(accessToken, group.id);
      setInviteActive(false);
      setInviteLink('');
      setNotice(t('workspace.groups.inviteRevoked'));
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
      setNotice(t('workspace.groups.inviteCopied'));
    } catch (copyError) {
      setError(copyError.message || t('workspace.groups.copyInviteError'));
    }
  }

  async function changeRole(member, nextRole) {
    if (isSaving || member.role === nextRole || !isOwner) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await updateGroupMemberRole(accessToken, group.id, member.user_id, nextRole);
      setNotice(t('workspace.groups.memberRoleUpdated'));
      await Promise.all([loadManagementData(), refreshGroup()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeMember(member) {
    if (isSaving || !window.confirm(t('workspace.groups.removeMemberConfirm', { member: memberName(member) }))) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await removeGroupMember(accessToken, group.id, member.user_id);
      setMembers((current) => current.filter((item) => String(item.user_id) !== String(member.user_id)));
      setNotice(t('workspace.groups.memberRemoved'));
      await refreshGroup();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function transferAndLeave() {
    const recipient = members.find((member) => String(member.user_id) === String(ownershipRecipientId));
    if (isSaving || !recipient) {
      setError(t('workspace.groups.selectOwnershipRecipient'));
      return;
    }
    if (!window.confirm(t('workspace.groups.transferAndLeaveConfirm', { member: memberName(recipient) }))) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await transferGroupOwnership(accessToken, group.id, recipient.user_id);
      await leaveGroup(accessToken, group.id);
      await onLeave?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function transferOwnership() {
    const recipient = members.find((member) => String(member.user_id) === String(ownershipRecipientId));
    if (isSaving || !isOwner || !recipient) {
      setError(t('workspace.groups.selectOwnershipRecipient'));
      return;
    }
    if (!window.confirm(t('workspace.groups.transferOwnershipConfirm', { member: memberName(recipient) }))) return;

    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await transferGroupOwnership(accessToken, group.id, recipient.user_id);
      setOwnershipRecipientId('');
      setNotice(t('workspace.groups.ownershipTransferred'));
      await Promise.all([loadManagementData(), refreshGroup()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function leaveCurrentGroup() {
    if (isSaving || !window.confirm(t('workspace.groups.leaveConfirm'))) return;
    setError('');
    setIsSaving(true);
    try {
      await leaveGroup(accessToken, group.id);
      await onLeave?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCurrentGroup() {
    if (isSaving || !isOwner || !window.confirm(t('workspace.groups.deleteGroupConfirm', { group: group.title }))) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await deleteGroup(accessToken, group.id);
      await onDeleted?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  const otherMembers = members.filter((member) => String(member.user_id) !== String(currentUserId));

  return <section className="workspace-chat-panel channel-details-panel group-details-panel" aria-labelledby="group-details-title">
    <header className="chat-header">
      <AraButton className="chat-back-button" onClick={onBack} size="compact" variant="ghost"><Icon name="arrow-left" size={18} />{t('workspace.groups.backToChat')}</AraButton>
      <div className="channel-details-title"><h1 id="group-details-title">{t('workspace.groups.groupInfo')}</h1><span>{group.title}</span></div>
      <AraButton className="channel-header-action" aria-label={t('workspace.groups.refreshManagement')} disabled={isLoading || isSaving} onClick={() => void loadManagementData()} size="icon" title={t('workspace.groups.refreshManagement')} variant="ghost"><Icon name="refresh" size={18} /></AraButton>
    </header>

    <div className="channel-details-content">
      {error ? <div className="workspace-list-error" role="alert"><strong>{t('workspace.groups.operationError')}</strong><span>{error}</span></div> : null}
      {notice ? <p className="workspace-list-notice" role="status">{notice}</p> : null}
      <section className="workspace-section-card channel-info-card">
        <div className="channel-details-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(group.title)}</div>
        <div><h2>{group.title || t('workspace.groups.untitled')}</h2><p>{group.description || t('workspace.groups.noDescription')}</p><span>{t('workspace.groups.privateGroup')} · {t('workspace.groups.membersCount', { count: members.length || group.participant_ids?.length || 0 })}</span></div>
      </section>

      {isOwner ? <form className="workspace-section-card channel-details-form" onSubmit={saveGroup}>
        <div className="workspace-section-heading"><div><h2>{t('workspace.groups.editGroup')}</h2><p>{t('workspace.groups.editGroupHint')}</p></div></div>
        <label className="workspace-field"><span>{t('workspace.groups.titleLabel')}</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength="2" maxLength="120" required disabled={isSaving} /></label>
        <label className="workspace-field"><span>{t('workspace.groups.descriptionLabel')}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" rows="3" disabled={isSaving} /></label>
        <input className="sr-only" ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,image/avif" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
        <div className="channel-avatar-upload"><span><Icon name="image" size={18} /></span><div><strong>{t('workspace.groups.avatarLabel')}</strong><small>{avatarFile?.name || t('workspace.groups.keepAvatar')}</small></div><AraButton onClick={() => avatarInputRef.current?.click()} size="compact" type="button" variant="ghost">{t('workspace.groups.chooseAvatar')}</AraButton></div>
        <AraButton type="submit" disabled={isSaving || title.trim().length < 2} variant="primary">{isSaving ? t('workspace.groups.savingGroup') : t('workspace.groups.saveGroup')}</AraButton>
      </form> : null}

      {canManage ? <section className="workspace-section-card channel-invite-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.groups.inviteTitle')}</h2><p>{inviteActive ? t('workspace.groups.inviteActive') : t('workspace.groups.inviteInactive')}</p></div></div>
        {inviteLink ? <div className="channel-invite-link"><code>{inviteLink}</code><AraButton onClick={() => void copyInvite()} size="compact" type="button" variant="secondary"><Icon name="link" size={15} />{t('workspace.groups.copyInvite')}</AraButton></div> : null}
        <div className="channel-inline-actions"><AraButton onClick={() => void createInvite()} disabled={isSaving} size="compact" type="button" variant="primary">{inviteActive ? t('workspace.groups.regenerateInvite') : t('workspace.groups.generateInvite')}</AraButton>{inviteActive ? <AraButton onClick={() => void revokeInvite()} disabled={isSaving} size="compact" type="button" variant="secondary">{t('workspace.groups.revokeInvite')}</AraButton> : null}</div>
      </section> : null}

      {canManage ? <section className="workspace-section-card group-add-members-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.groups.addMembers')}</h2><p>{t('workspace.groups.addMembersHint')}</p></div></div>
        <form className="contacts-search group-member-search" onSubmit={searchMembers}>
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="group-management-search">{t('workspace.groups.searchMembersLabel')}</label>
          <input id="group-management-search" type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder={t('workspace.groups.searchPlaceholder')} disabled={isSearching || isSaving} />
          <AraButton type="submit" disabled={isSearching || isSaving} size="compact" variant="primary">{isSearching ? t('workspace.groups.searching') : t('workspace.groups.searchAction')}</AraButton>
        </form>
        <p className="group-member-search-hint" aria-live="polite">{isSearching ? t('workspace.groups.searching') : hasSearched ? t('workspace.groups.searchResults', { count: searchResults.length }) : t('workspace.groups.searchHint')}</p>
        {hasSearched && !isSearching && !searchResults.length ? <p className="group-member-search-empty">{t('workspace.groups.noResults')}</p> : null}
        {searchResults.length ? <div className="group-search-results">{searchResults.map((user) => {
          const profile = profileForUser(user);
          if (!profile) return null;
          return <AraButton className="group-search-result" key={user.id} disabled={isSaving} onClick={() => void addMember(user)} variant="ghost"><span><strong>{profile.display_name || profile.username}</strong><small>{profile.username ? `@${profile.username}` : ''}</small></span><span>{t('workspace.groups.addMember')}</span></AraButton>;
        })}</div> : null}
      </section> : null}

      <section className="workspace-section-card channel-members-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.groups.membersTitle')}</h2><p>{t('workspace.groups.membersHint')}</p></div><span>{members.length || group.participant_ids?.length || 0}</span></div>
        {isLoading ? <p className="channel-empty" role="status">{t('workspace.groups.loadingMembers')}</p> : <div className="channel-member-list">{members.map((member) => {
          const isCurrentUser = String(member.user_id) === String(currentUserId);
          const canChangeRole = isOwner && member.role !== 'owner' && !isCurrentUser;
          const canRemove = !isCurrentUser && member.role !== 'owner' && (isOwner || (role === 'admin' && member.role === 'member'));
          return <article className="channel-member" key={member.user_id}>
            <span className="channel-member-avatar">{mediaUrlForDesktop(member.avatar_ref) ? <img src={mediaUrlForDesktop(member.avatar_ref)} alt="" /> : initials(memberName(member))}</span>
            <div><strong>{memberName(member)}</strong><small>{member.username ? `@${member.username}` : t(`workspace.groups.role${member.role[0].toUpperCase()}${member.role.slice(1)}`)}</small></div>
            {canChangeRole ? <select aria-label={t('workspace.groups.memberRoleLabel', { member: memberName(member) })} disabled={isSaving} onChange={(event) => void changeRole(member, event.target.value)} value={member.role}><option value="member">{t('workspace.groups.roleMember')}</option><option value="admin">{t('workspace.groups.roleAdmin')}</option></select> : <span className="channel-member-role">{t(`workspace.groups.role${member.role[0].toUpperCase()}${member.role.slice(1)}`)}</span>}
            {canRemove ? <AraButton className="channel-member-remove" aria-label={t('workspace.groups.removeMemberLabel', { member: memberName(member) })} disabled={isSaving} onClick={() => void removeMember(member)} size="icon" title={t('workspace.groups.removeMember')} variant="ghost"><Icon name="trash" size={15} /></AraButton> : null}
          </article>;
        })}</div>}
      </section>

      {isOwner ? <section className="channel-leave-card group-transfer-card"><div><h2>{t('workspace.groups.transferOwnershipTitle')}</h2><p>{t('workspace.groups.transferOwnershipHint')}</p></div><div className="group-transfer-controls"><label className="sr-only" htmlFor="group-ownership-recipient">{t('workspace.groups.selectOwnershipRecipient')}</label><select id="group-ownership-recipient" value={ownershipRecipientId} onChange={(event) => setOwnershipRecipientId(event.target.value)} disabled={isSaving || !otherMembers.length}><option value="">{t('workspace.groups.selectOwnershipRecipient')}</option>{otherMembers.map((member) => <option key={member.user_id} value={member.user_id}>{memberName(member)}</option>)}</select><AraButton disabled={isSaving || !otherMembers.length} onClick={() => void transferOwnership()} type="button" variant="secondary">{t('workspace.groups.transferOwnership')}</AraButton></div></section> : null}
      {isOwner ? <section className="channel-leave-card group-transfer-card"><div><h2>{t('workspace.groups.transferAndLeaveTitle')}</h2><p>{t('workspace.groups.transferAndLeaveHint')}</p></div><div className="group-transfer-controls"><AraButton disabled={isSaving || !ownershipRecipientId} onClick={() => void transferAndLeave()} type="button" variant="secondary">{t('workspace.groups.transferAndLeave')}</AraButton></div></section> : <section className="channel-leave-card"><div><h2>{t('workspace.groups.leaveTitle')}</h2><p>{t('workspace.groups.leaveHint')}</p></div><AraButton disabled={isSaving} onClick={() => void leaveCurrentGroup()} type="button" variant="secondary">{t('workspace.groups.leaveGroup')}</AraButton></section>}
      {isOwner ? <section className="channel-delete-card"><div><h2>{t('workspace.groups.deleteTitle')}</h2><p>{t('workspace.groups.deleteHint')}</p></div><AraButton disabled={isSaving} onClick={() => void deleteCurrentGroup()} type="button" variant="secondary">{isSaving ? t('workspace.groups.deletingGroup') : t('workspace.groups.deleteGroup')}</AraButton></section> : null}
    </div>
  </section>;
}
