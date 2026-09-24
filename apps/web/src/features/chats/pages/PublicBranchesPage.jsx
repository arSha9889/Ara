import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { EmptyState } from '../../../shared/ui/EmptyState.jsx';
import { getPublicBranches, subscribeToBranch, unsubscribeFromBranch } from '../api/chatApi.js';

export function PublicBranchesPage() {
  const { language, t } = useI18n();
  const { session } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get('onboarding') === '1';
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

  async function handleUnsubscribe(chatId) {
    setError('');
    setSubscribingId(chatId);
    try {
      const branch = await unsubscribeFromBranch(session.accessToken, chatId);
      setBranches((current) => current.map((item) => item.id === chatId ? branch : item));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubscribingId(null);
    }
  }

  return (
    <section className={`content-grid branches-page ${isOnboarding ? 'is-onboarding' : ''}`}>
      <div className="panel chat-list-panel">
        <header className="section-header">
          <div>
            <p className="eyebrow">AraChat</p>
            <h1>{isOnboarding ? t('chats.branchOnboardingTitle') : t('chats.publicBranches')}</h1>
            <p className="muted">{isOnboarding ? t('chats.branchOnboardingText') : t('chats.publicBranchesText')}</p>
          </div>
          {isOnboarding ? <button className="button button-secondary branches-skip-button" type="button" onClick={() => navigate('/app', { replace: true })}>{t('chats.branchOnboardingSkip')}</button> : null}
        </header>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        {isLoading ? <AraChatLoader compact title={t('chats.publicBranches')} text={t('chats.loadingText')} /> : null}
        {!isLoading && branches.length === 0 ? <EmptyState title={t('chats.publicBranches')} text={t('chats.publicBranchesEmpty')} /> : null}
        <div className="list-stack">
          {branches.map((branch) => (
            <article className="info-card branch-card" key={branch.id}>
              <div className="chat-list-avatar branch-avatar" aria-hidden="true">{branch.avatar_ref || '◎'}</div>
              <div className="chat-thread-copy">
                <strong>{branch.title} {branch.is_official ? <span className="official-badge" title={t('chats.officialTitle')}>✓</span> : null}</strong>
                <span className="muted">{branch.description}</span>
                <span className="branch-subscriber-count">{t('chats.subscribers').replace('{count}', Number(branch.subscriber_count || 0).toLocaleString(language))}</span>
              </div>
              {branch.is_subscribed ? (
                <div className="branch-card-actions">
                  <Link className="button button-secondary" to={`/app/chats/${branch.id}`}>{t('chats.openBranch')}</Link>
                  {!branch.can_post ? <button className="branch-unsubscribe-button" type="button" disabled={subscribingId === branch.id} onClick={() => handleUnsubscribe(branch.id)}>{t('chats.unsubscribe')}</button> : null}
                </div>
              ) : (
                <button className="button button-secondary" type="button" disabled={subscribingId === branch.id} aria-busy={subscribingId === branch.id} onClick={() => handleSubscribe(branch.id)}>
                  {subscribingId === branch.id ? t('common.loading') : t('chats.subscribe')}
                </button>
              )}
            </article>
          ))}
        </div>
        {isOnboarding && !isLoading ? (
          <div className="branches-onboarding-actions">
            <button className="button button-primary branches-continue-button" type="button" onClick={() => navigate('/app', { replace: true })}>{t('chats.branchOnboardingContinue')}</button>
          </div>
        ) : null}
      </div>
      <div className="panel desktop-only">
        <EmptyState title={t('chats.publicBranches')} text={t('chats.publicBranchesText')} />
      </div>
    </section>
  );
}
