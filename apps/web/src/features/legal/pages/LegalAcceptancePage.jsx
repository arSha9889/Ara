import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { acceptCurrentLegalDocuments } from '../../auth/api/authApi.js';
import { PublicSiteHeader } from '../../onboarding/components/PublicSiteHeader.jsx';

export function LegalAcceptancePage() {
  const { t } = useI18n();
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
      setError(t('legal.acceptBoth'));
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
    <main className="public-page ara-page ara-legal-page">
      <div className="public-shell">
        <PublicSiteHeader minimal showAuthAction={false} showLanguage={false} />
        <section className="auth-page legal-page">
          <form className="panel readable legal-acceptance" onSubmit={handleSubmit}>
        <p className="eyebrow">{t('legal.updatedDocuments')}</p>
        <h1>{t('legal.acceptanceTitle')}</h1>
        <p className="muted">{t('legal.acceptanceText')}</p>

        <div className="legal-acceptance-notice">
          <strong>{t('legal.important')}</strong> {t('legal.securityNotice')}
        </div>

        <div className="legal-consent-card">
          <label className="legal-consent-row">
            <input type="checkbox" checked={acceptedPrivacy} onChange={(event) => setAcceptedPrivacy(event.target.checked)} />
            <span>{t('legal.acceptPrivacyPrefix')}<Link to="/privacy" target="_blank" rel="noreferrer">{t('legal.privacyTitle')}</Link>{t('legal.consentSuffix')}</span>
          </label>
          <label className="legal-consent-row">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
            <span>{t('legal.acceptTermsPrefix')}<Link to="/terms" target="_blank" rel="noreferrer">{t('legal.termsTitle')}</Link>{t('legal.consentSuffix')}</span>
          </label>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        <div className="legal-actions">
          <Button type="submit" disabled={isSubmitting || !acceptedPrivacy || !acceptedTerms}>{isSubmitting ? t('legal.saving') : t('legal.acceptAndContinue')}</Button>
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={clearSession}>{t('legal.logout')}</Button>
        </div>
          </form>
        </section>
      </div>
    </main>
  );
}
