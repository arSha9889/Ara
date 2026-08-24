import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../../app/providers/I18nProvider.jsx';
import { Icon } from './Icon.jsx';
import { getLanguageOption, LanguagePickerList } from './LanguagePicker.jsx';

export function LanguageSwitcher({ onChange }) {
  const { language, setLanguage, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const wasOpenRef = useRef(false);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const selectedLanguage = getLanguageOption(language);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    if (!isOpen) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) triggerRef.current?.focus();
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  function handleChange(nextLanguage) {
    if (nextLanguage === language) {
      setIsOpen(false);
      return;
    }
    setLanguage(nextLanguage);
    onChange?.(nextLanguage);
    setIsOpen(false);
  }

  return (
    <div className="language-switcher">
      <button
        className="select-switcher-button language-switcher-trigger"
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={t('settings.language')}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="segment-glyph flag" aria-hidden="true">{selectedLanguage.icon}</span>
        <span className="select-switcher-copy">
          <strong>{selectedLanguage.label}</strong>
          <small>{selectedLanguage.code}</small>
        </span>
        <span className="select-switcher-chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen ? createPortal(
        <div className="language-dialog-layer" role="presentation" onMouseDown={() => setIsOpen(false)}>
          <section className="language-dialog" role="dialog" aria-modal="true" aria-labelledby="language-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="language-dialog-handle" aria-hidden="true" />
            <div className="language-dialog-heading">
              <span className="language-dialog-icon" aria-hidden="true"><Icon name="globe" size={21} /></span>
              <div>
                <p className="eyebrow">AraChat</p>
                <h2 id="language-dialog-title">{t('settings.languagePickerTitle')}</h2>
                <p>{t('settings.languagePickerText')}</p>
              </div>
            </div>
            <button className="language-dialog-close" type="button" onClick={() => setIsOpen(false)} aria-label={t('common.close')}><Icon name="x" size={19} /></button>
            <LanguagePickerList selectedLanguage={language} onSelect={handleChange} inputRef={searchRef} />
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
