import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { acceptCurrentLegalDocuments } from '../../auth/api/authApi.js';

export function LegalAcceptancePage() {
  const { session, saveSession, clearSession } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!acceptedPrivacy || !acceptedTerms) {
      setError('Для продолжения подтвердите принятие обоих документов.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await acceptCurrentLegalDocuments(session.accessToken);
      saveSession({ ...session, user });
      navigate(location.state?.from?.pathname || '/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page legal-page">
      <form className="panel readable legal-acceptance" onSubmit={handleSubmit}>
        <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" /><span>AraChat</span></Link>
        <p className="eyebrow">Обновление документов</p>
        <h1>Подтвердите новую редакцию документов</h1>
        <p className="muted">Мы обновили Политику конфиденциальности и Пользовательское соглашение. Чтобы продолжить пользоваться AraChat, ознакомьтесь с ними и подтвердите принятие редакции от 30 июля 2026 года.</p>

        <div className="legal-acceptance-notice">
          <strong>Важно:</strong> сообщения в текущей версии AraChat не защищены сквозным шифрованием, а вложения временно доступны по публичным ссылкам. Не отправляйте через сервис чувствительные сведения.
        </div>

        <div className="legal-consent-card">
          <label className="legal-consent-row">
            <input type="checkbox" checked={acceptedPrivacy} onChange={(event) => setAcceptedPrivacy(event.target.checked)} />
            <span>Я принимаю <Link to="/privacy" target="_blank" rel="noreferrer">Политику конфиденциальности и обработки персональных данных</Link>.</span>
          </label>
          <label className="legal-consent-row">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
            <span>Я принимаю <Link to="/terms" target="_blank" rel="noreferrer">Пользовательское соглашение AraChat</Link>.</span>
          </label>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        <div className="legal-actions">
          <Button type="submit" disabled={isSubmitting || !acceptedPrivacy || !acceptedTerms}>{isSubmitting ? 'Сохраняем...' : 'Принять и продолжить'}</Button>
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={clearSession}>Выйти из аккаунта</Button>
        </div>
      </form>
    </main>
  );
}
