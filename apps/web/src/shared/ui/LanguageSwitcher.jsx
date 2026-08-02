import { useEffect, useRef, useState } from 'react';

import { SUPPORTED_LANGUAGES, useI18n } from '../../app/providers/I18nProvider.jsx';

const LANGUAGE_OPTIONS = [
  { id: 'ru', label: 'Русский', icon: '🇷🇺', code: 'RU' },
  { id: 'en', label: 'English', icon: '🇬🇧', code: 'EN' },
  { id: 'kk', label: 'Қазақша', icon: '🇰🇿', code: 'KK' },
  { id: 'ky', label: 'Кыргызча', icon: '🇰🇬', code: 'KY' },
  { id: 'uk', label: 'Українська', icon: '🇺🇦', code: 'UK' },
  { id: 'be', label: 'Беларуская', icon: '🇧🇾', code: 'BE' },
  { id: 'uz', label: 'Ўзбекча', icon: '🇺🇿', code: 'UZ' },
].filter((item) => SUPPORTED_LANGUAGES.includes(item.id));

export function LanguageSwitcher({ onChange }) {
  const { language, setLanguage } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const switcherRef = useRef(null);
  const selectedLanguage = LANGUAGE_OPTIONS.find((item) => item.id === language) ?? LANGUAGE_OPTIONS[0];

  useEffect(() => {
    function handlePointerDown(event) {
      if (!switcherRef.current?.contains(event.target)) setIsOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function handleChange(nextLanguage) {
    setLanguage(nextLanguage);
    onChange?.(nextLanguage);
    setIsOpen(false);
  }

  return (
    <div className={`select-switcher language-switcher ${isOpen ? 'open' : ''}`} ref={switcherRef}>
      <button
        className="select-switcher-button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Language"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="segment-glyph flag" aria-hidden="true">{selectedLanguage.icon}</span>
        <span className="select-switcher-copy">
          <strong>{selectedLanguage.label}</strong>
          <small>{selectedLanguage.code}</small>
        </span>
        <span className="select-switcher-chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div className="select-switcher-menu" role="listbox" aria-label="Language">
          {LANGUAGE_OPTIONS.map((item) => (
            <button
              className={`select-switcher-option ${language === item.id ? 'active' : ''}`}
              type="button"
              key={item.id}
              role="option"
              aria-selected={language === item.id}
              onClick={() => handleChange(item.id)}
            >
              <span className="segment-glyph flag" aria-hidden="true">{item.icon}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.code}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
