import { useI18n } from '../../app/providers/I18nProvider.jsx';
import { Icon } from './Icon.jsx';

export function VpnWarningBanner() {
  const { t } = useI18n();

  return (
    <aside className="vpn-warning-banner" role="alert">
      <span className="vpn-warning-banner-icon" aria-hidden="true"><Icon name="shield" size={19} /></span>
      <p>{t('vpn.warning')}</p>
    </aside>
  );
}
