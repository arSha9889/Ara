import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { EmptyState } from '../../../shared/ui/EmptyState.jsx';
import { getPublicBranches, subscribeToBranch } from '../api/chatApi.js';

export function PublicBranchesPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingId, setSubscribingId] = useState(null);

  useEffect(() => {
    async function loadBranches() {
      try {
        setBranches(await getPublicBranches(session.accessToken));
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadBranches();
  }, [session.accessToken]);

  async function handleSubscribe(chatId) {
    setError('');
    setSubscribingId(chatId);
    try {
      const branch = await subscribeToBranch(session.accessToken, chatId);
      setBranches((current) => current.map((item) => item.id === chatId ? branch : item));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubscribingId(null);
    }
  }

  return (
    <section className="content-grid branches-page">
      <div className="panel chat-list-panel">
        <header className="section-header">
          <div>
            <h1>{t('chats.publicBranches')}</h1>
            <p className="muted">{t('chats.publicBranchesText')}</p>
          </div>
        </header>
        {error ? <p className="error-text">{error}</p> : null}
        {isLoading ? <AraChatLoader compact title={t('chats.publicBranches')} text={t('chats.loadingText')} /> : null}
        {!isLoading && branches.length === 0 ? <EmptyState title={t('chats.publicBranches')} text={t('chats.publicBranchesEmpty')} /> : null}
        <div className="list-stack">
          {branches.map((branch) => (
            <article className="info-card branch-card" key={branch.id}>
              <div className="chat-list-avatar branch-avatar" aria-hidden="true">{branch.avatar_ref || '◎'}</div>
              <div className="chat-thread-copy">
                <strong>{branch.title} {branch.is_official ? <span className="official-badge" title="Официальная ветвь">✓</span> : null}</strong>
                <span className="muted">{branch.description}</span>
              </div>
              {branch.is_subscribed ? (
                <Link className="button button-secondary" to={`/app/chats/${branch.id}`}>{t('chats.openBranch')}</Link>
              ) : (
                <button className="button button-secondary" type="button" disabled={subscribingId === branch.id} onClick={() => handleSubscribe(branch.id)}>
                  {subscribingId === branch.id ? '…' : t('chats.subscribe')}
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
      <div className="panel desktop-only">
        <EmptyState title={t('chats.publicBranches')} text={t('chats.publicBranchesText')} />
      </div>
    </section>
  );
}
