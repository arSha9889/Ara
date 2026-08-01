import { useI18n } from '../../app/providers/I18nProvider.jsx';

export function AraChatLoader({ title, text, compact = false, hero = false }) {
  const { t } = useI18n();
  const loaderTitle = title ?? t('loading.bootTitle');
  const loaderText = text ?? t('loading.bootText');

  return (
    <div className={`arachat-loader ${compact ? 'compact' : ''} ${hero ? 'hero' : ''}`} role="status" aria-live="polite">
      <div className="arachat-loader-visual" aria-hidden="true">
        {hero ? <img src="/icons/arachat-loader-flight.svg" alt="" /> : <span className="arachat-loader-spinner" />}
      </div>
      <div className="arachat-loader-copy">
        <strong>{loaderTitle}</strong>
        {loaderText ? <span>{loaderText}</span> : null}
      </div>
    </div>
  );
}
