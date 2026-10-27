import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';

export function DownloadConfirmationDialog({ isOpen, onClose, returnFocusRef }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) returnFocusRef?.current?.focus();
    wasOpenRef.current = isOpen;
  }, [isOpen, returnFocusRef]);

  function trapFocus(event) {
    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusableElements = [...dialogRef.current.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (!focusableElements.length) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && (document.activeElement === dialogRef.current || document.activeElement === firstFocusable)) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  }

  function confirmDownload() {
    onClose();
    navigate('/download');
  }

  if (!isOpen) return null;

  return (
    <div className="ara-download-dialog-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="ara-download-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-dialog-title"
        aria-describedby="download-dialog-description"
        ref={dialogRef}
        tabIndex="-1"
        onKeyDown={trapFocus}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="ara-download-dialog-close" type="button" ref={closeButtonRef} onClick={onClose} aria-label={t('common.close')}>
          <Icon name="x" size={19} />
        </button>
        <span className="ara-download-dialog-icon" aria-hidden="true"><Icon name="smartphone" size={22} /></span>
        <p className="ara-overline">{t('onboarding.downloadConfirmationKicker')}</p>
        <h2 id="download-dialog-title">{t('onboarding.downloadConfirmationTitle')}</h2>
        <p id="download-dialog-description">{t('onboarding.downloadConfirmationText')}</p>
        <div className="ara-download-dialog-actions">
          <button className="ara-button ara-button-secondary" type="button" onClick={onClose}>{t('onboarding.downloadConfirmationCancel')}</button>
          <button className="ara-button ara-button-primary" type="button" onClick={confirmDownload}>{t('onboarding.downloadConfirmationConfirm')}<Icon name="arrowRight" size={17} /></button>
        </div>
      </section>
    </div>
  );
}
