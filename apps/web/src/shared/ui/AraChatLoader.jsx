import { useI18n } from '../../app/providers/I18nProvider.jsx';

export function AraChatLoader({ title, text, compact = false }) {
  const { t } = useI18n();
  const loaderTitle = title ?? t('loading.bootTitle');
  const loaderText = text ?? t('loading.bootText');

  return (
    <div className={`arachat-loader ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
      <div className="arachat-loader-orb" aria-hidden="true">
        <img src="/icons/arachat-parrot-icon-192.png" alt="" />
      </div>
      <div className="arachat-loader-copy">
        <strong>{loaderTitle}</strong>
        {loaderText ? <span>{loaderText}</span> : null}
      </div>
    </div>
  );
}
