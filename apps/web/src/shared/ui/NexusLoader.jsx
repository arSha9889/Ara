import { useI18n } from '../../app/providers/I18nProvider.jsx';

export function NexusLoader({ title, text, compact = false }) {
  const { t } = useI18n();
  const loaderTitle = title ?? t('loading.bootTitle');
  const loaderText = text ?? t('loading.bootText');

  return (
    <div className={`nexus-loader ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
      <div className="nexus-loader-orb" aria-hidden="true">
        <img src="/icons/nexus-loader.gif" alt="" />
      </div>
      <div className="nexus-loader-copy">
        <strong>{loaderTitle}</strong>
        {loaderText ? <span>{loaderText}</span> : null}
      </div>
    </div>
  );
}
