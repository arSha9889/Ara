import { useState } from 'react';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { createDirectChatForUser } from '../../features/chats/chatsApi.js';
import { searchPublicUsers } from '../../features/users/usersApi.js';

const AVATAR_TONES = ['violet', 'coral', 'yellow', 'blue'];

function initials(displayName, username) {
  const value = displayName || username || '?';
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function avatarTone(userId) {
  const total = [...userId].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return AVATAR_TONES[total % AVATAR_TONES.length];
}

export function ContactsPanel({ accessToken, currentUserId, mode, onChatCreated, t }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [chatError, setChatError] = useState('');
  const isNewChat = mode === 'new';
  const selectedUser = results.find((user) => user.id === selectedUserId);

  async function search(event) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    setSelectedUserId('');
    setError('');
    setChatError('');
    if (!normalizedQuery) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    try {
      const users = await searchPublicUsers(accessToken, normalizedQuery);
      setResults(users.filter((user) => user.id !== currentUserId));
      setHasSearched(true);
    } catch (requestError) {
      setResults([]);
      setHasSearched(true);
      setError(requestError.message);
    } finally {
      setIsSearching(false);
    }
  }

  async function openDirectChat() {
    if (!selectedUser || isOpeningChat) return;

    setChatError('');
    setIsOpeningChat(true);
    try {
      const chat = await createDirectChatForUser(accessToken, selectedUser.id);
      onChatCreated?.(chat);
    } catch (requestError) {
      setChatError(requestError.message);
    } finally {
      setIsOpeningChat(false);
    }
  }

  return (
    <section className="workspace-detail-panel workspace-contacts-panel" aria-labelledby="contacts-title">
      <header className="workspace-panel-heading">
        <div>
          <p>{t(isNewChat ? 'workspace.contactsPanel.newKicker' : 'workspace.contactsPanel.kicker')}</p>
          <h1 id="contacts-title">{t(isNewChat ? 'workspace.contactsPanel.newTitle' : 'workspace.contactsPanel.title')}</h1>
          <span>{t(isNewChat ? 'workspace.contactsPanel.newIntro' : 'workspace.contactsPanel.intro')}</span>
        </div>
        <span className="workspace-panel-icon"><Icon name="contacts" size={25} /></span>
      </header>

      <div className="workspace-section-card contacts-search-card">
        <form className="contacts-search" onSubmit={search}>
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="contacts-search-query">{t('workspace.contactsPanel.searchLabel')}</label>
          <input id="contacts-search-query" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedUserId(''); setError(''); setChatError(''); }} placeholder={t('workspace.contactsPanel.searchPlaceholder')} aria-invalid={Boolean(error)} aria-describedby={error ? 'contacts-search-error' : undefined} disabled={isSearching || isOpeningChat} />
          {query ? <button type="button" aria-label={t('workspace.contactsPanel.clearSearch')} onClick={() => { setQuery(''); setResults([]); setSelectedUserId(''); setHasSearched(false); setError(''); setChatError(''); }} disabled={isSearching || isOpeningChat}><Icon name="close" size={15} /></button> : null}
          <button className="contacts-search-submit" type="submit" disabled={isSearching || isOpeningChat}>{isSearching ? t('workspace.contactsPanel.searching') : t('workspace.contactsPanel.searchAction')}</button>
        </form>
        <p aria-live="polite">{isSearching ? t('workspace.contactsPanel.searching') : hasSearched ? t('workspace.contactsPanel.searchResults', { count: results.length }) : t('workspace.contactsPanel.searchHint')}</p>
        {error ? <p className="workspace-form-notice is-error" id="contacts-search-error" role="alert">{error}</p> : null}

        {results.length ? (
          <div className="contacts-result-list">
            {results.map((user) => {
              const profile = user.profile;
              if (!profile) return null;
              const isSelected = selectedUserId === user.id;
              return (
                <button className={`contact-result-row ${isSelected ? 'is-selected' : ''}`} type="button" key={user.id} aria-pressed={isSelected} onClick={() => { setSelectedUserId(user.id); setChatError(''); }} disabled={isOpeningChat}>
                  <span className={`workspace-avatar is-${avatarTone(user.id)}`} aria-hidden="true">{initials(profile.display_name, profile.username)}</span>
                  <span><strong>{profile.display_name}</strong><small>@{profile.username}</small></span>
                  <span className="contact-result-id">{user.nexus_id}</span>
                </button>
              );
            })}
          </div>
        ) : hasSearched && !isSearching && !error ? (
          <div className="contacts-no-results"><span className="workspace-section-icon"><Icon name="search" size={18} /></span><strong>{t('workspace.contactsPanel.noResultsTitle')}</strong><p>{t('workspace.contactsPanel.noResultsText')}</p></div>
        ) : null}
      </div>

      {selectedUser?.profile ? (
        <section className="contact-found-card" aria-live="polite">
          <div className="contact-found-heading">
            <span className={`workspace-avatar workspace-avatar-large is-${avatarTone(selectedUser.id)}`} aria-hidden="true">{initials(selectedUser.profile.display_name, selectedUser.profile.username)}</span>
            <div><p>{t('workspace.contactsPanel.userFound')}</p><h2>{selectedUser.profile.display_name}</h2><span>@{selectedUser.profile.username}</span></div>
          </div>
          <dl><div><dt>{t('workspace.contactsPanel.arachatId')}</dt><dd>{selectedUser.nexus_id}</dd></div><div><dt>{t('workspace.contactsPanel.contactHandle')}</dt><dd>@{selectedUser.profile.username}</dd></div></dl>
          {isNewChat ? (
            <>
              <button className="workspace-primary-button" type="button" onClick={openDirectChat} disabled={isOpeningChat} aria-describedby={chatError ? 'contacts-chat-error' : undefined}>
                <Icon name="chats" size={16} />{isOpeningChat ? t('workspace.contactsPanel.openingChat') : t('workspace.contactsPanel.openChat')}
              </button>
              {chatError ? <p className="workspace-form-notice is-error" id="contacts-chat-error" role="alert">{chatError}</p> : null}
            </>
          ) : <p className="contact-found-note"><Icon name="shield" size={15} />{t('workspace.contactsPanel.searchOnlyNote')}</p>}
        </section>
      ) : null}
    </section>
  );
}
