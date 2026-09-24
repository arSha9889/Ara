import { useEffect, useState } from 'react';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useAuthenticatedMediaUrl } from '../../../shared/api/mediaUrl.js';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import {
  createAdminSupportMessage,
  getAdminSupportTicket,
  getAdminSupportTickets,
  updateAdminSupportTicket,
  uploadSupportAttachment,
} from '../../support/api/supportApi.js';

const SUPPORT_STATUSES = ['new', 'in_progress', 'waiting_user', 'resolved', 'closed'];
const MAX_ATTACHMENT_SIZE_BYTES = 30 * 1024 * 1024;

function formatDate(value, language) {
  return value ? new Date(value).toLocaleString(language) : '—';
}

function formatBytes(value, language) {
  if (typeof value !== 'number') return '';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024 / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} MB`;
}

function attachmentPayload(upload) {
  return upload ? {
    attachment_url: upload.media_url,
    attachment_name: upload.media_name,
    attachment_mime_type: upload.media_mime_type,
    attachment_size_bytes: upload.media_size_bytes,
  } : {
    attachment_url: null,
    attachment_name: null,
    attachment_mime_type: null,
    attachment_size_bytes: null,
  };
}


function SupportAttachment({ message, language, accessToken, t }) {
  const { url } = useAuthenticatedMediaUrl(message.attachment_url, accessToken);
  if (!message.attachment_url) return null;
  return (
    <a className="support-attachment" href={url || undefined} download={message.attachment_name || true} target="_blank" rel="noreferrer" aria-disabled={!url}>
      <Icon name="paperclip" size={16} />
      <span>{message.attachment_name || t('support.attachment')}</span>
      {typeof message.attachment_size_bytes === 'number' ? <small>{formatBytes(message.attachment_size_bytes, language)}</small> : null}
    </a>
  );
}

function SupportStatus({ status, t }) {
  return <span className={`support-status ${status}`}>{t(`support.statuses.${status}`)}</span>;
}

export function SupportTicketsPanel() {
  const { language, t } = useI18n();
  const { session } = useSession();
  const { lastNotification } = useNotifications();
  const [statusFilter, setStatusFilter] = useState('all');
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  async function loadTickets() {
    setIsLoading(true);
    try {
      const result = await getAdminSupportTickets(session.accessToken, statusFilter);
      setTickets(result.tickets);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function openTicket(ticketId) {
    setIsLoadingDetail(true);
    try {
      setSelectedTicket(await getAdminSupportTicket(session.accessToken, ticketId));
      setMessageText('');
      setSelectedFile(null);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, statusFilter]);

  useEffect(() => {
    if (lastNotification?.kind === 'support') void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastNotification?.id]);

  function selectAttachment(file) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setError(t('support.attachmentTooLarge'));
      return;
    }
    setSelectedFile(file);
    setError('');
  }

  async function changeStatus(status) {
    if (!selectedTicket || isSubmitting || status === selectedTicket.status) return;
    setIsSubmitting(true);
    try {
      const ticket = await updateAdminSupportTicket(session.accessToken, selectedTicket.id, status);
      setSelectedTicket(ticket);
      await loadTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitMessage(event) {
    event.preventDefault();
    if (!selectedTicket || !messageText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const attachment = selectedFile ? await uploadSupportAttachment(session.accessToken, selectedFile) : null;
      const ticket = await createAdminSupportMessage(session.accessToken, selectedTicket.id, {
        text: messageText.trim(),
        is_internal: isInternal,
        ...attachmentPayload(attachment),
      });
      setSelectedTicket(ticket);
      setMessageText('');
      setSelectedFile(null);
      await loadTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <header className="admin-page-heading">
        <div><p className="eyebrow">{t('support.eyebrow')}</p><h1>{t('admin.supportTitle')}</h1><p>{t('admin.supportText')}</p></div>
        <button className="admin-icon-button" type="button" onClick={() => void loadTickets()} aria-label={t('admin.refresh')} title={t('admin.refresh')}><Icon name="refresh" /></button>
      </header>
      {error ? <p className="error-text">{error}</p> : null}
      <section className="admin-support-layout">
        <aside className="admin-support-queue admin-surface">
          <header><h2>{t('admin.supportQueue')}</h2><select className="text-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">{t('support.allStatuses')}</option>{SUPPORT_STATUSES.map((status) => <option value={status} key={status}>{t(`support.statuses.${status}`)}</option>)}</select></header>
          {isLoading ? <AraChatLoader compact title={t('admin.loadingSupport')} text={t('support.loadingTicketsText')} /> : null}
          {!isLoading && tickets.length === 0 ? <p className="admin-empty-state">{t('admin.supportQueueEmpty')}</p> : null}
          <div className="admin-support-ticket-list">
            {tickets.map((ticket) => <button className={selectedTicket?.id === ticket.id ? 'active' : ''} type="button" onClick={() => void openTicket(ticket.id)} key={ticket.id}><span><strong>#{ticket.number} · {ticket.subject}</strong><small>{ticket.requester?.display_name || ticket.requester?.username || t('admin.unknownUser')} · {formatDate(ticket.last_message_at, language)}</small></span><SupportStatus status={ticket.status} t={t} /></button>)}
          </div>
        </aside>
        <section className="admin-support-detail admin-surface">
          {!selectedTicket && !isLoadingDetail ? <p className="admin-empty-state">{t('admin.selectSupportTicket')}</p> : null}
          {isLoadingDetail ? <AraChatLoader compact title={t('admin.loadingSupport')} text={t('support.loadingTicketText')} /> : null}
          {selectedTicket && !isLoadingDetail ? <>
            <header className="admin-support-detail-header"><div><p className="eyebrow">{t('support.ticket')} #{selectedTicket.number}</p><h2>{selectedTicket.subject}</h2><p>{t('admin.supportRequester').replace('{name}', selectedTicket.requester?.display_name || selectedTicket.requester?.username || t('admin.unknownUser'))}</p></div><label className="admin-support-status-select"><span>{t('support.status')}</span><select className="text-input" value={selectedTicket.status} disabled={isSubmitting} onChange={(event) => void changeStatus(event.target.value)}>{SUPPORT_STATUSES.map((status) => <option value={status} key={status}>{t(`support.statuses.${status}`)}</option>)}</select></label></header>
            <div className="admin-support-message-list">
              {selectedTicket.messages.map((message) => <article className={`admin-support-message ${message.is_internal ? 'internal' : ''}`} key={message.id}><header><strong>{message.is_internal ? t('admin.supportInternalNote') : message.author?.display_name || t('admin.unknownUser')}</strong><time dateTime={message.created_at}>{formatDate(message.created_at, language)}</time></header><p>{message.text}</p><SupportAttachment message={message} language={language} accessToken={session.accessToken} t={t} /></article>)}
            </div>
            <form className={`admin-support-composer ${isInternal ? 'internal' : ''}`} onSubmit={submitMessage}><div className="admin-support-composer-head"><strong>{isInternal ? t('admin.supportInternalNote') : t('admin.supportReply')}</strong><label><input type="checkbox" checked={isInternal} onChange={(event) => setIsInternal(event.target.checked)} />{t('admin.supportMakeInternal')}</label></div><textarea className="text-input" value={messageText} maxLength="4000" required placeholder={isInternal ? t('admin.supportInternalPlaceholder') : t('admin.supportReplyPlaceholder')} onChange={(event) => setMessageText(event.target.value)} /><div className="support-composer-actions"><label className="support-file-button"><Icon name="paperclip" size={18} /><span>{selectedFile ? selectedFile.name : t('support.addAttachment')}</span><input type="file" onChange={(event) => selectAttachment(event.target.files?.[0])} /></label>{selectedFile ? <button className="support-remove-file" type="button" onClick={() => setSelectedFile(null)} aria-label={t('support.removeAttachment')}><Icon name="x" size={16} /></button> : null}<button className="button button-primary" type="submit" disabled={isSubmitting || !messageText.trim()}><Icon name="send" size={17} />{isSubmitting ? t('support.sending') : isInternal ? t('admin.supportSaveNote') : t('admin.supportSendReply')}</button></div></form>
          </> : null}
        </section>
      </section>
    </>
  );
}
