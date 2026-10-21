import { useCallback, useEffect, useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { getCallHistory } from '../../features/calls/callsApi.js';

function formatCallDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(document.documentElement.lang || 'ru', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function peerName(item, t) {
  return item.peer?.display_name || item.peer?.username || t('workspace.unknownUser');
}

export function CallsPanel({ accessToken, call, onNewCall, onOpenHistoryChat, onStartHistoryCall, t }) {
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [startingHistoryId, setStartingHistoryId] = useState('');
  const isCallActive = call.callState !== 'idle';
  const canStartCall = call.canUseCalls && call.canSignalCall && call.callState === 'idle';
  const signalingStatus = call.canSignalCall
    ? t('workspace.callsPanel.connected')
    : t('workspace.callsPanel.disconnected');
  const mediaStatus = call.canUseCalls
    ? t('workspace.callsPanel.available')
    : t('workspace.callsPanel.unsupported');

  const loadHistory = useCallback(async ({ showLoading = true } = {}) => {
    if (!accessToken) return;
    if (showLoading) setIsLoadingHistory(true);
    setHistoryError('');
    try {
      const items = await getCallHistory(accessToken);
      setHistory(Array.isArray(items) ? items : []);
    } catch (requestError) {
      setHistoryError(requestError.message);
    } finally {
      if (showLoading) setIsLoadingHistory(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function startHistoryCall(item) {
    if (!canStartCall || startingHistoryId) return;
    setStartingHistoryId(String(item.id));
    try {
      await onStartHistoryCall?.(item);
    } finally {
      setStartingHistoryId('');
    }
  }

  return (
    <section className="workspace-detail-panel workspace-calls-panel" aria-labelledby="calls-title">
      <header className="workspace-panel-heading">
        <div>
          <p>{t('workspace.callsPanel.kicker')}</p>
          <h1 id="calls-title">{t('workspace.callsPanel.title')}</h1>
          <span>{t('workspace.callsPanel.intro')}</span>
        </div>
        <span className="workspace-panel-icon"><Icon name="calls" size={25} /></span>
      </header>

      <section className="call-start-card" aria-labelledby="call-start-title">
        <span className="call-start-icon" aria-hidden="true"><Icon name="calls" size={27} /></span>
        <div className="call-start-copy">
          <h2 id="call-start-title">{t('workspace.callsPanel.startTitle')}</h2>
          <p>{t('workspace.callsPanel.startText')}</p>
          <AraButton type="button" variant="secondary" onClick={onNewCall}><Icon name="contacts" size={15} />{t('workspace.callsPanel.findPerson')}</AraButton>
        </div>
      </section>

      {isCallActive ? <div className="call-active-notice" role="status" aria-live="polite">
        <Icon name={call.callType === 'video' ? 'video' : 'calls'} size={18} />
        <div><strong>{t('workspace.callsPanel.activeCall')}</strong><span>{call.statusText || t('workspace.callsPanel.connecting')}</span></div>
      </div> : null}

      <div className="workspace-section-card call-availability-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.callsPanel.availabilityTitle')}</h2><p>{t('workspace.callsPanel.availabilityText')}</p></div></div>
        <ul className="call-readiness-list">
          <li><span className="readiness-icon"><Icon name="calls" size={17} /></span><div><strong>{t('workspace.callsPanel.signaling')}</strong><span>{t('workspace.callsPanel.signalingText')}</span></div><em className={call.canSignalCall ? 'is-ready' : ''}>{signalingStatus}</em></li>
          <li><span className="readiness-icon"><Icon name="mic" size={17} /></span><div><strong>{t('workspace.callsPanel.microphone')}</strong><span>{t('workspace.callsPanel.microphoneText')}</span></div><em className={call.canUseCalls ? 'is-ready' : 'is-unavailable'}>{mediaStatus}</em></li>
          <li><span className="readiness-icon"><Icon name="camera" size={17} /></span><div><strong>{t('workspace.callsPanel.camera')}</strong><span>{t('workspace.callsPanel.cameraText')}</span></div><em className={call.canUseCalls ? 'is-ready' : 'is-unavailable'}>{mediaStatus}</em></li>
        </ul>
      </div>

      <section className="workspace-section-card calls-history-card" aria-labelledby="calls-history-title" aria-busy={isLoadingHistory}>
        <div className="workspace-section-heading">
          <div><h2 id="calls-history-title">{t('workspace.callsPanel.historyTitle')}</h2><p>{t('workspace.callsPanel.historyText')}</p></div>
          <AraButton type="button" aria-label={t('workspace.callsPanel.refreshHistory')} title={t('workspace.callsPanel.refreshHistory')} onClick={() => void loadHistory()} disabled={isLoadingHistory} size="icon" variant="ghost"><Icon name="refresh" size={16} /></AraButton>
        </div>
        {historyError ? <div className="workspace-list-error" role="alert"><strong>{t('workspace.callsPanel.historyError')}</strong><span>{historyError}</span><AraButton type="button" onClick={() => void loadHistory()} size="compact" variant="primary">{t('workspace.retry')}</AraButton></div> : null}
        {isLoadingHistory ? <p className="calls-history-status" role="status">{t('workspace.callsPanel.loadingHistory')}</p> : historyError ? null : history.length ? <ul className="calls-history-list">{history.map((item) => {
          const itemId = String(item.id);
          const typeKey = item.call_type === 'video' ? 'video' : 'audio';
          const directionKey = item.direction === 'incoming' ? 'historyDirectionIncoming' : 'historyDirectionOutgoing';
          const outcomeKey = {
            completed: 'historyOutcomeCompleted',
            cancelled: 'historyOutcomeCancelled',
            rejected: 'historyOutcomeRejected',
            busy: 'historyOutcomeBusy',
            failed: 'historyOutcomeFailed',
          }[item.outcome] || 'historyOutcomeFailed';
          return <li className="calls-history-row" key={item.id}>
            <span className={`calls-history-type is-${item.direction}`} aria-hidden="true"><Icon name={item.direction === 'incoming' ? 'phone-incoming' : 'phone-outgoing'} size={16} /></span>
            <div className="calls-history-copy"><strong>{peerName(item, t)}</strong><span>{t(`workspace.callsPanel.${directionKey}`)} · {t(`workspace.callsPanel.${typeKey}`)}</span><small>{formatCallDate(item.ended_at || item.started_at)}{item.duration_seconds != null ? ` · ${t('workspace.callsPanel.historyDuration', { duration: formatDuration(item.duration_seconds) })}` : ''}</small></div>
            <span className={`calls-history-outcome is-${item.outcome}`}>{t(`workspace.callsPanel.${outcomeKey}`)}</span>
            <div className="calls-history-actions"><AraButton type="button" size="compact" variant="ghost" onClick={() => void onOpenHistoryChat?.(item)} aria-label={t('workspace.callsPanel.openChatWith', { name: peerName(item, t) })}>{t('workspace.callsPanel.openChat')}</AraButton><AraButton type="button" size="compact" variant="secondary" onClick={() => void startHistoryCall(item)} disabled={!canStartCall || startingHistoryId === itemId} aria-label={t('workspace.callsPanel.callAgainWith', { name: peerName(item, t), type: t(`workspace.callsPanel.${typeKey}`).toLowerCase() })}><Icon name={typeKey === 'video' ? 'video' : 'calls'} size={14} />{startingHistoryId === itemId ? t('workspace.callsPanel.starting') : t('workspace.callsPanel.callAgain')}</AraButton></div>
          </li>;
        })}</ul> : <div className="calls-history-empty"><Icon name="calls" size={22} /><strong>{t('workspace.callsPanel.historyEmptyTitle')}</strong><p>{t('workspace.callsPanel.historyEmptyText')}</p></div>}
      </section>
    </section>
  );
}
