import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { mediaUrlForBrowser } from '../../../shared/api/mediaUrl.js';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { EmptyState } from '../../../shared/ui/EmptyState.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import {
  createSupportMessage,
  createSupportTicket,
  getSupportTicket,
  getSupportTickets,
  uploadSupportAttachment,
} from '../api/supportApi.js';

const SUPPORT_CATEGORIES = ['account', 'security', 'messages', 'notifications', 'bug', 'suggestion', 'other'];
const MAX_ATTACHMENT_SIZE_BYTES = 30 * 1024 * 1024;
const EMPTY_TICKET_DRAFT = { category: 'account', subject: '', message: '' };

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

function SupportAttachment({ message, language }) {
  if (!message.attachment_url) return null;
  return (
    <a className="support-attachment" href={mediaUrlForBrowser(message.attachment_url)} target="_blank" rel="noreferrer">
      <Icon name="paperclip" size={16} />
      <span>{message.attachment_name || 'attachment'}</span>
      {typeof message.attachment_size_bytes === 'number' ? <small>{formatBytes(message.attachment_size_bytes, language)}</small> : null}
    </a>
  );
}

function TicketStatus({ status, t }) {
  return <span className={`support-status ${status}`}>{t(`support.statuses.${status}`)}</span>;
}

export function SupportPage() {
  const { language, t } = useI18n();
  const { session } = useSession();
  const { lastNotification } = useNotifications();
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [ticket, setTicket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [ticketDraft, setTicketDraft] = useState(EMPTY_TICKET_DRAFT);
  const [replyText, setReplyText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadTickets() {
    setIsLoading(true);
    try {
      setTickets(await getSupportTickets(session.accessToken));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTicket() {
    if (!ticketId) return;
    setIsLoading(true);
    try {
      setTicket(await getSupportTicket(session.accessToken, ticketId));
      setError('');
    } catch (err) {
      setTicket(null);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (ticketId) {
      void loadTicket();
    } else {
      void loadTickets();
    }
    // The route and authenticated session determine which data is visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, session.accessToken]);

  useEffect(() => {
    if (lastNotification?.kind !== 'support') return;
    if (ticketId && lastNotification.support_ticket_id === ticketId) {
      void loadTicket();
    } else if (!ticketId) {
      void loadTickets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastNotification?.id, ticketId]);

  function selectAttachment(file) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setError(t('support.attachmentTooLarge'));
      return;
    }
    setSelectedFile(file);
    setError('');
  }

  async function uploadSelectedAttachment() {
    return selectedFile ? uploadSupportAttachment(session.accessToken, selectedFile) : null;
  }

  async function submitTicket(event) {
    event.preventDefault();
    if (!ticketDraft.subject.trim() || !ticketDraft.message.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const attachment = await uploadSelectedAttachment();
      const createdTicket = await createSupportTicket(session.accessToken, {
        category: ticketDraft.category,
        subject: ticketDraft.subject.trim(),
        message: ticketDraft.message.trim(),
        ...attachmentPayload(attachment),
      });
      setTicketDraft(EMPTY_TICKET_DRAFT);
      setSelectedFile(null);
      setIsCreateFormOpen(false);
      navigate(`/app/support/${createdTicket.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitReply(event) {
    event.preventDefault();
    if (!ticket || !replyText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const attachment = await uploadSelectedAttachment();
      const nextTicket = await createSupportMessage(session.accessToken, ticket.id, {
        text: replyText.trim(),
        ...attachmentPayload(attachment),
      });
      setTicket(nextTicket);
      setReplyText('');
      setSelectedFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (ticketId) {
    return (
      <section className="support-page">
        <header className="support-page-header">
          <Link className="support-back-button" to="/app/support" aria-label={t('support.backToTickets')}><Icon name="arrowLeft" size={20} /></Link>
          <div><p className="eyebrow">AraChat Support</p><h1>{ticket ? `${t('support.ticket')} #${ticket.number}` : t('support.title')}</h1></div>
        </header>
        {error ? <p className="error-text">{error}</p> : null}
        {isLoading ? <AraChatLoader title={t('support.loadingTicket')} text={t('support.loadingTicketText')} /> : null}
        {!isLoading && !ticket ? <EmptyState title={t('support.ticketNotFound')} text={t('support.ticketNotFoundText')} action={<Link className="button button-secondary" to="/app/support">{t('support.backToTickets')}</Link>} /> : null}
        {ticket ? (
          <main className="support-detail-layout">
            <section className="support-conversation-panel">
              <header className="support-ticket-header">
                <div><h2>{ticket.subject}</h2><p>{t(`support.categories.${ticket.category}`)} · {t('support.createdAt').replace('{date}', formatDate(ticket.created_at, language))}</p></div>
                <TicketStatus status={ticket.status} t={t} />
              </header>
              <div className="support-message-list" aria-live="polite">
                {ticket.messages.map((message) => {
                  const isMine = message.author_user_id === session.user?.id;
                  return (
                    <article className={`support-message ${isMine ? 'mine' : 'theirs'}`} key={message.id}>
                      <div className="support-message-meta"><strong>{isMine ? t('support.you') : message.author?.display_name || t('support.team')}</strong><time dateTime={message.created_at}>{formatDate(message.created_at, language)}</time></div>
                      <p>{message.text}</p>
                      <SupportAttachment message={message} language={language} />
                    </article>
                  );
                })}
              </div>
              <form className="support-composer" onSubmit={submitReply}>
                <textarea className="text-input" value={replyText} maxLength="4000" required placeholder={t('support.replyPlaceholder')} onChange={(event) => setReplyText(event.target.value)} />
                <div className="support-composer-actions">
                  <label className="support-file-button" title={t('support.addAttachment')}>
                    <Icon name="paperclip" size={18} />
                    <span>{selectedFile ? selectedFile.name : t('support.addAttachment')}</span>
                    <input type="file" onChange={(event) => selectAttachment(event.target.files?.[0])} />
                  </label>
                  {selectedFile ? <button className="support-remove-file" type="button" onClick={() => setSelectedFile(null)} aria-label={t('support.removeAttachment')}><Icon name="x" size={16} /></button> : null}
                  <button className="button button-primary" type="submit" disabled={isSubmitting || !replyText.trim()}><Icon name="send" size={17} />{isSubmitting ? t('support.sending') : t('support.send')}</button>
                </div>
              </form>
            </section>
            <aside className="support-ticket-sidebar">
              <h2>{t('support.ticketDetails')}</h2>
              <dl><div><dt>{t('support.category')}</dt><dd>{t(`support.categories.${ticket.category}`)}</dd></div><div><dt>{t('support.status')}</dt><dd><TicketStatus status={ticket.status} t={t} /></dd></div><div><dt>{t('support.updatedAt')}</dt><dd>{formatDate(ticket.updated_at, language)}</dd></div></dl>
            </aside>
          </main>
        ) : null}
      </section>
    );
  }

  return (
    <section className="support-page">
      <header className="support-page-header support-center-header">
        <div><p className="eyebrow">AraChat Support</p><h1>{t('support.title')}</h1><p>{t('support.description')}</p></div>
        <button className="button button-primary" type="button" onClick={() => setIsCreateFormOpen((current) => !current)}><Icon name="plus" size={18} />{t('support.newTicket')}</button>
      </header>
      {error ? <p className="error-text">{error}</p> : null}
      {isCreateFormOpen ? (
        <form className="support-create-form" onSubmit={submitTicket}>
          <header><div><h2>{t('support.createTitle')}</h2><p>{t('support.createText')}</p></div><button className="support-remove-file" type="button" onClick={() => setIsCreateFormOpen(false)} aria-label={t('common.close')}><Icon name="x" size={18} /></button></header>
          <div className="support-form-grid"><label className="field"><span>{t('support.category')}</span><select className="text-input" value={ticketDraft.category} onChange={(event) => setTicketDraft((current) => ({ ...current, category: event.target.value }))}>{SUPPORT_CATEGORIES.map((category) => <option key={category} value={category}>{t(`support.categories.${category}`)}</option>)}</select></label><label className="field"><span>{t('support.subject')}</span><input className="text-input" value={ticketDraft.subject} minLength="3" maxLength="160" required onChange={(event) => setTicketDraft((current) => ({ ...current, subject: event.target.value }))} /></label></div>
          <label className="field"><span>{t('support.message')}</span><textarea className="text-input" value={ticketDraft.message} minLength="1" maxLength="4000" required onChange={(event) => setTicketDraft((current) => ({ ...current, message: event.target.value }))} /></label>
          <div className="support-create-actions"><label className="support-file-button"><Icon name="paperclip" size={18} /><span>{selectedFile ? selectedFile.name : t('support.addAttachment')}</span><input type="file" onChange={(event) => selectAttachment(event.target.files?.[0])} /></label>{selectedFile ? <button className="support-remove-file" type="button" onClick={() => setSelectedFile(null)} aria-label={t('support.removeAttachment')}><Icon name="x" size={16} /></button> : null}<small>{t('support.attachmentHint')}</small><button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? t('support.creating') : t('support.create')}</button></div>
        </form>
      ) : null}
      {isLoading ? <AraChatLoader compact title={t('support.loadingTickets')} text={t('support.loadingTicketsText')} /> : null}
      {!isLoading && tickets.length === 0 ? <EmptyState title={t('support.emptyTitle')} text={t('support.emptyText')} action={<button className="button button-primary" type="button" onClick={() => setIsCreateFormOpen(true)}>{t('support.newTicket')}</button>} /> : null}
      <div className="support-ticket-list">
        {tickets.map((item) => <Link className="support-ticket-card" to={`/app/support/${item.id}`} key={item.id}><div className="support-ticket-card-main"><span className="support-ticket-number">#{item.number}</span><div><strong>{item.subject}</strong><p>{item.last_message_preview || t('support.noMessages')}</p><small>{t(`support.categories.${item.category}`)} · {formatDate(item.last_message_at, language)}</small></div></div><TicketStatus status={item.status} t={t} /><Icon name="chevronRight" size={18} /></Link>)}
      </div>
    </section>
  );
}
