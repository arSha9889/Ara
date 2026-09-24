import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { PHONE_COUNTRIES } from '../../../shared/phone/countries.js';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { searchUsers } from '../../profile/api/userApi.js';
import { PublicProfileSheet } from '../../profile/components/PublicProfileSheet.jsx';
import { createDirectChat, createDirectChatForUser } from '../api/chatApi.js';

const NEW_CHAT_METHODS = ['account', 'phone'];

export function NewChatPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const navigate = useNavigate();
  const [method, setMethod] = useState('account');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('RU');
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  useEffect(() => {
    const normalized = query.trim().replace(/^@/, '');
    if (method !== 'account' || normalized.length < 2) {
      setResults([]);
      setError('');
      setIsSearching(false);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      setError('');
      searchUsers(session.accessToken, normalized)
        .then((users) => {
          if (active) setResults(users.filter((user) => user.id !== session.user?.id));
        })
        .catch((err) => { if (active) setError(err.message); })
        .finally(() => { if (active) setIsSearching(false); });
    }, 280);
    return () => { active = false; window.clearTimeout(timer); };
  }, [method, query, session.accessToken, session.user?.id]);

  async function openChatForUser(user) {
    if (!user || isOpeningChat) return;
    try {
      setError('');
      setIsOpeningChat(true);
      const chat = await createDirectChatForUser(session.accessToken, user.id);
      navigate(`/app/chats/${chat.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsOpeningChat(false);
    }
  }

  async function findByPhone(event) {
    event.preventDefault();
    if (!phone.trim() || isOpeningChat) return;
    try {
      setError('');
      setIsOpeningChat(true);
      const chat = await createDirectChat(session.accessToken, { country, phone });
      navigate(`/app/chats/${chat.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsOpeningChat(false);
    }
  }

  function handleMethodTabKeyDown(event, currentIndex) {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % NEW_CHAT_METHODS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + NEW_CHAT_METHODS.length) % NEW_CHAT_METHODS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = NEW_CHAT_METHODS.length - 1;
    else return;

    event.preventDefault();
    setMethod(NEW_CHAT_METHODS[nextIndex]);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }

  const hasTypedQuery = query.trim().replace(/^@/, '').length >= 2;
  return (
    <section className="new-chat-page">
      <header className="new-chat-header">
        <button className="new-chat-back" type="button" onClick={() => navigate('/app')} aria-label={t('messages.backToChats')}><Icon name="arrowLeft" size={20} /></button>
        <div><p className="eyebrow">AraChat</p><h1>{t('chats.newChatTitle')}</h1><p>{t('chats.newChatText')}</p></div>
      </header>
      <div className="new-chat-layout">
        <section className="new-chat-search-panel">
          <div className="new-chat-methods" role="tablist" aria-label={t('chats.newChatTitle')}>
            <button className={method === 'account' ? 'active' : ''} type="button" role="tab" id="new-chat-tab-account" aria-selected={method === 'account'} aria-controls={method === 'account' ? 'new-chat-panel-account' : undefined} tabIndex={method === 'account' ? 0 : -1} onClick={() => setMethod('account')} onKeyDown={(event) => handleMethodTabKeyDown(event, 0)}><Icon name="search" size={18} />{t('chats.searchByAccount')}</button>
            <button className={method === 'phone' ? 'active' : ''} type="button" role="tab" id="new-chat-tab-phone" aria-selected={method === 'phone'} aria-controls={method === 'phone' ? 'new-chat-panel-phone' : undefined} tabIndex={method === 'phone' ? 0 : -1} onClick={() => setMethod('phone')} onKeyDown={(event) => handleMethodTabKeyDown(event, 1)}><Icon name="phone" size={18} />{t('chats.newChatFindByPhone')}</button>
          </div>
          {method === 'account' ? <div className="new-chat-account-panel" id="new-chat-panel-account" role="tabpanel" aria-labelledby="new-chat-tab-account">
            <label className="new-chat-query-field">
              <Icon name="search" size={20} />
              <input name="account_query" autoComplete="off" spellCheck={false} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chats.newChatSearchPlaceholder')} aria-label={t('chats.newChatSearchLabel')} />
              {isSearching ? <span className="new-chat-search-spinner" role="status" aria-label={t('chats.newChatSearching')} /> : null}
            </label>
            <p className="new-chat-hint"><Icon name="sparkles" size={16} />{t('chats.newChatSearchHint')}</p>
            <div className="new-chat-results" aria-live="polite">
              {isSearching ? <div className="new-chat-result-skeleton"><span /><span /><span /></div> : null}
              {!isSearching && hasTypedQuery && !error && results.length === 0 ? <div className="new-chat-empty"><span className="new-chat-empty-icon"><Icon name="user" size={24} /></span><strong>{t('chats.newChatSearchEmpty')}</strong><p>{t('chats.newChatEmptyHint')}</p></div> : null}
              {results.map((user, index) => <article className="new-chat-result" key={user.id} style={{ '--result-index': index }}>
                <button className="new-chat-result-main" type="button" onClick={() => setSelectedUser(user)} aria-label={`${t('chats.openProfile')}: ${user.profile?.display_name || user.profile?.username}`}>
                  <UserAvatar profile={user.profile} fallback={user.profile?.display_name?.[0] || user.profile?.username?.[0] || 'A'} />
                  <span><strong>{user.profile?.display_name || user.profile?.username}{user.is_official ? <i className="new-chat-official"><Icon name="check" size={12} /></i> : null}</strong><small>@{user.profile?.username}</small></span>
                  <Icon name="chevronRight" size={19} className="new-chat-result-chevron" />
                </button>
                <button className="new-chat-write-button" type="button" onClick={() => openChatForUser(user)} disabled={isOpeningChat}><Icon name="chat" size={17} />{t('chats.newChatWrite')}</button>
              </article>)}
            </div>
          </div> : <div id="new-chat-panel-phone" role="tabpanel" aria-labelledby="new-chat-tab-phone">
            <form className="new-chat-phone-form" onSubmit={findByPhone}>
              <div className="new-chat-phone-orb"><Icon name="phone" size={28} /></div>
              <div><h2>{t('chats.newChatFindByPhone')}</h2><p>{t('chats.newChatFindByPhoneText')}</p></div>
              <label className="field"><span>{t('register.phoneCountry')}</span><select className="select" name="country" value={country} onChange={(event) => setCountry(event.target.value)}>{PHONE_COUNTRIES.map((item) => <option value={item.code} key={item.code}>{item.flag} {t(`register.${item.labelKey}`)} · {item.dialCode}</option>)}</select></label>
              <label className="field"><span>{t('chats.phone')}</span><input className="text-input" name="phone" type="tel" inputMode="tel" autoComplete="tel" spellCheck={false} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={PHONE_COUNTRIES.find((item) => item.code === country)?.placeholder} /></label>
              <button className="button button-primary new-chat-phone-submit" type="submit" disabled={!phone.trim() || isOpeningChat}><Icon name="arrowRight" size={18} />{isOpeningChat ? t('chats.openingChat') : t('chats.newChatFind')}</button>
            </form>
          </div>}
          {error ? <p className="error-text" role="alert">{error}</p> : null}
        </section>
        <aside className="new-chat-aside" aria-hidden="true"><div className="new-chat-aside-orbit orbit-one" /><div className="new-chat-aside-orbit orbit-two" /><div className="new-chat-aside-avatar"><Icon name="chat" size={32} /></div><strong>{t('chats.newChatAsideTitle')}</strong><p>{t('chats.newChatAsideText')}</p></aside>
      </div>
      <PublicProfileSheet user={selectedUser} isOpen={Boolean(selectedUser)} onClose={() => setSelectedUser(null)} onWrite={() => openChatForUser(selectedUser)} isWriting={isOpeningChat} />
    </section>
  );
}
