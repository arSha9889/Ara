export function LegalDialog({ documentType, onClose, t }) {
  if (!documentType) return null;
  const title = documentType === 'privacy' ? t('legal.privacyTitle') : t('legal.termsTitle');

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onClose}>
      <section className="legal-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
        <p className="dialog-kicker">{title}</p>
        <h2 id="legal-dialog-title">{t('legal.previewTitle')}</h2>
        <p>{t('legal.previewText')}</p>
        <button className="button button-primary" type="button" onClick={onClose}>{t('legal.acknowledgement')}</button>
      </section>
    </div>
  );
}
