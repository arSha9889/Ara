import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { OFFICIAL_CHANNELS } from '../../../shared/config/projectLinks.js';

const navigation = [
  { to: '/#story', translation: 'comet.navigationStory' },
  { to: '/news', translation: 'comet.navigationNews' },
  { to: '/download', translation: 'onboarding.downloadNavigation' },
  { to: '/#flight', translation: 'comet.navigationFlight' },
];

export function AraFooter() {
  const { t } = useI18n();

  return (
    <footer className="ara-footer">
      <div className="ara-footer-brand">
        <Link to="/" className="ara-brand">
          <img src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" />
          <span>AraChat</span>
        </Link>
        <p>{t('comet.finalText')}</p>
      </div>

      <nav className="ara-footer-column" aria-label={t('common.navigation')}>
        <strong>{t('common.navigation')}</strong>
        {navigation.map((item) => <Link to={item.to} key={item.to}>{t(item.translation)}</Link>)}
      </nav>

      <div className="ara-footer-column">
        <strong>{t('comet.navigationChannels')}</strong>
        {OFFICIAL_CHANNELS.filter((channel) => channel.href).map((channel) => (
          <a href={channel.href} target="_blank" rel="noreferrer" key={channel.key}>{channel.title}</a>
        ))}
      </div>

      <div className="ara-footer-column">
        <strong>{t('onboarding.legalLinksLabel')}</strong>
        <Link to="/privacy">{t('onboarding.privacyPolicy')}</Link>
        <Link to="/terms">{t('onboarding.terms')}</Link>
      </div>
    </footer>
  );
}
