import { useEffect, useRef, useState } from 'react';

import { SUPPORTED_LANGUAGES } from '../i18n/copy.js';
import { WorkspaceIcon as Icon } from './WorkspaceIcon.jsx';

export function ThemeToggle({ preferences, updatePreferences, t, compact = false, presentation = 'default' }) {
  return (
    <button
      className={`theme-toggle theme-toggle--${presentation} ${compact ? 'is-compact' : ''}`}
      type="button"
      onClick={() => updatePreferences({ theme: preferences.theme === 'dark' ? 'light' : 'dark' })}
      aria-label={`${t('common.theme')}: ${preferences.theme === 'dark' ? t('common.dark') : t('common.light')}`}
    >
      {presentation === 'auth' ? <span className="theme-toggle-swatch" aria-hidden="true" /> : preferences.theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.64 5.64 7.2 7.2M16.8 16.8l1.56 1.56M18.36 5.64 16.8 7.2M7.2 16.8l-1.56 1.56M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.1A8.3 8.3 0 0 1 8.9 4 8.5 8.5 0 1 0 20 15.1Z" /></svg>
      )}
    </button>
  );
}

function AuthLanguageMenu({ preferences, updatePreferences, t }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnOutsideInteraction(event) {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  function chooseLanguage(language) {
    updatePreferences({ language });
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div className="auth-language-control" ref={menuRef}>
      <button
        ref={triggerRef}
        aria-controls="auth-language-menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t('common.language')}
        className="auth-language-button"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Icon name="globe" size={18} />
        <span className={`language-flag language-flag--${preferences.language}`} aria-hidden="true" />
      </button>
      {isOpen ? <div className="auth-language-menu" id="auth-language-menu" role="menu" aria-label={t('common.language')}>
        {SUPPORTED_LANGUAGES.map((language) => <button aria-checked={preferences.language === language.id} key={language.id} role="menuitemradio" type="button" onClick={() => chooseLanguage(language.id)}>
          <span className={`language-flag language-flag--${language.id}`} aria-hidden="true" />
          <span>{language.label}</span>
          {preferences.language === language.id ? <Icon name="check" size={15} /> : null}
        </button>)}
      </div> : null}
    </div>
  );
}

export function ThemeLanguageControls({ preferences, updatePreferences, t, compact = false, presentation = 'default' }) {
  if (presentation === 'auth') {
    return (
      <div className={`preference-controls preference-controls--${presentation} ${compact ? 'is-compact' : ''}`}>
        <AuthLanguageMenu preferences={preferences} updatePreferences={updatePreferences} t={t} />
      </div>
    );
  }

  return (
    <div className={`preference-controls preference-controls--${presentation} ${compact ? 'is-compact' : ''}`}>
      <label className="select-control">
        <span className="sr-only">{t('common.language')}</span>
        <select value={preferences.language} onChange={(event) => updatePreferences({ language: event.target.value })} aria-label={t('common.language')}>
          {SUPPORTED_LANGUAGES.map((language) => <option value={language.id} key={language.id}>{language.label}</option>)}
        </select>
      </label>
      <ThemeToggle preferences={preferences} updatePreferences={updatePreferences} t={t} compact={compact} presentation={presentation} />
    </div>
  );
}
