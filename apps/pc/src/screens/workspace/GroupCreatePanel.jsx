import { useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { createGroup, uploadGroupAvatar } from '../../features/chats/chatsApi.js';
import { searchPublicUsers } from '../../features/users/usersApi.js';

function userProfile(user) {
  return user?.profile || user || null;
}

function userName(user) {
  const profile = userProfile(user);
  return profile?.display_name || profile?.username || '';
}

export function GroupCreatePanel({ accessToken, currentUserId, onBack, onCreated, t }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  async function searchMembers() {
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
      setSearchResults((Array.isArray(users) ? users : []).filter((user) => String(user.id) !== String(currentUserId)));
      setHasSearched(true);
    } catch (requestError) {
      setSearchResults([]);
      setHasSearched(true);
      setError(requestError.message);
    } finally {
      setIsSearching(false);
    }
  }

  function addMember(user) {
    if (!user?.id) return;
    setSelectedMembers((current) => current.some((member) => String(member.id) === String(user.id)) ? current : [...current, user]);
    setError('');
  }

  function removeMember(userId) {
    setSelectedMembers((current) => current.filter((member) => String(member.id) !== String(userId)));
  }

  async function submit(event) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (isCreating || normalizedTitle.length < 2) return;

    setError('');
    setIsCreating(true);
    try {
      const payload = {
        title: normalizedTitle,
        description: description.trim(),
        member_user_ids: selectedMembers.map((member) => member.id),
      };
      if (avatarFile) {
        const avatar = await uploadGroupAvatar(accessToken, avatarFile);
        payload.avatar_ref = avatar.media_url;
      }
      const result = await createGroup(accessToken, payload);
      if (!result?.chat) throw new Error(t('workspace.groups.createInvalidResponse'));
      onCreated?.(result.chat);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsCreating(false);
    }
  }

  const selectedIds = new Set(selectedMembers.map((member) => String(member.id)));

  return <section className="workspace-detail-panel group-create-panel" aria-labelledby="group-create-title">
    <header className="workspace-panel-heading">
      <div>
        <p>{t('workspace.groups.create')}</p>
        <h1 id="group-create-title">{t('workspace.groups.createTitle')}</h1>
        <span>{t('workspace.groups.createIntro')}</span>
      </div>
      <AraButton aria-label={t('workspace.groups.backToGroups')} onClick={onBack} size="icon" title={t('workspace.groups.backToGroups')} variant="ghost"><Icon name="arrow-left" size={19} /></AraButton>
    </header>

    <form className="workspace-section-card group-create-form" onSubmit={submit}>
      {error ? <p className="workspace-form-notice is-error" role="alert">{error}</p> : null}
      <label className="workspace-field">
        <span>{t('workspace.groups.titleLabel')}</span>
        <input value={title} onChange={(event) => { setTitle(event.target.value); setError(''); }} minLength="2" maxLength="120" required disabled={isCreating} />
      </label>
      <label className="workspace-field">
        <span>{t('workspace.groups.descriptionLabel')}</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" rows="3" disabled={isCreating} />
      </label>
      <label className="group-avatar-field">
        <span><Icon name="image" size={18} /></span>
        <span><strong>{t('workspace.groups.avatarLabel')}</strong><small>{avatarFile?.name || t('workspace.groups.avatarHint')}</small></span>
        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,image/avif" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} disabled={isCreating} />
      </label>

      <section className="group-member-picker" aria-labelledby="group-member-picker-title">
        <div className="workspace-section-heading"><div><h2 id="group-member-picker-title">{t('workspace.groups.selectMembers')}</h2><p>{t('workspace.groups.selectedMembersCount', { count: selectedMembers.length })}</p></div></div>
        {selectedMembers.length ? <div className="group-selected-members">{selectedMembers.map((member) => <span key={member.id}><strong>{userName(member)}</strong>{userProfile(member)?.username ? <small>@{userProfile(member).username}</small> : null}<AraButton aria-label={t('workspace.groups.removeSelectedMember', { member: userName(member) })} disabled={isCreating} onClick={() => removeMember(member.id)} size="icon" title={t('workspace.groups.removeSelectedMember', { member: userName(member) })} variant="ghost"><Icon name="close" size={13} /></AraButton></span>)}</div> : null}
        <div className="contacts-search group-member-search" role="search">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="group-member-search">{t('workspace.groups.searchMembersLabel')}</label>
          <input id="group-member-search" type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchMembers(); } }} placeholder={t('workspace.groups.searchPlaceholder')} disabled={isSearching || isCreating} />
          <AraButton disabled={isSearching || isCreating} onClick={() => void searchMembers()} size="compact" variant="primary">{isSearching ? t('workspace.groups.searching') : t('workspace.groups.searchAction')}</AraButton>
        </div>
        <p className="group-member-search-hint" aria-live="polite">{isSearching ? t('workspace.groups.searching') : hasSearched ? t('workspace.groups.searchResults', { count: searchResults.length }) : t('workspace.groups.searchHint')}</p>
        {hasSearched && !isSearching && !searchResults.length ? <p className="group-member-search-empty">{t('workspace.groups.noResults')}</p> : null}
        {searchResults.length ? <div className="group-search-results">{searchResults.map((user) => {
          const profile = userProfile(user);
          if (!profile) return null;
          const isSelected = selectedIds.has(String(user.id));
          return <AraButton className="group-search-result" key={user.id} aria-pressed={isSelected} disabled={isCreating || isSelected} onClick={() => addMember(user)} variant={isSelected ? 'selected' : 'ghost'}><span><strong>{profile.display_name || profile.username}</strong><small>{profile.username ? `@${profile.username}` : ''}</small></span><span>{isSelected ? t('workspace.groups.selectedMember') : t('workspace.groups.addMember')}</span></AraButton>;
        })}</div> : null}
      </section>

      <AraButton type="submit" disabled={isCreating || title.trim().length < 2} variant="primary"><Icon name="groups" size={17} />{isCreating ? t('workspace.groups.creating') : t('workspace.groups.create')}</AraButton>
    </form>
  </section>;
}
