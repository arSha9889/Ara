import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { welcomeChat } from '../config/welcomeChat.js';

export function WelcomeChatPage() {
  const { t } = useI18n();

  return (
    <section className="panel chat-panel welcome-chat-panel">
      <header className="chat-header">
        <div className="chat-avatar-wrap">
          <div className="avatar" aria-hidden="true">{welcomeChat.avatar}</div>
          <span className="presence-dot online" aria-hidden="true" />
        </div>
        <div>
          <h1>{welcomeChat.title}</h1>
          <div className="chat-subtitle">
            <span>@{welcomeChat.username}</span>
            <span className="presence-pill online"><span aria-hidden="true" />{t('welcome.official')}</span>
          </div>
        </div>
      </header>

      <div className="message-list welcome-message-list">
        {welcomeChat.messages.map((message) => (
          <article className="message-bubble incoming welcome-message" key={message.id}>
            <strong>{message.author}</strong>
            <div>{t(message.textKey)}</div>
          </article>
        ))}
      </div>

      <div className="welcome-chat-actions">
        <Link className="button button-primary" to="/app">{t('welcome.start')}</Link>
        <Link className="button button-secondary" to="/app/settings">{t('welcome.openSettings')}</Link>
      </div>
    </section>
  );
}
