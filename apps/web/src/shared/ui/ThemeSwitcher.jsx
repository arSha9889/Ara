import { useEffect, useRef, useState } from 'react';

import { useTheme } from '../../app/providers/ThemeProvider.jsx';
import { useI18n } from '../../app/providers/I18nProvider.jsx';
import { themes } from '../config/themes.js';

const themeIcons = {
  halo: '✦',
  orbit: '◐',
  aurora: '✺',
  liquid_glass: '◇',
};

const themeCodes = {
  halo: 'HL',
  orbit: 'OR',
  aurora: 'AU',
  liquid_glass: 'LG',
};

export function ThemeSwitcher({ onChange }) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const switcherRef = useRef(null);
  const selectedTheme = themes.find((item) => item.id === theme) ?? themes[0];

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

  function handleChange(nextTheme) {
    setTheme(nextTheme);
    onChange?.(nextTheme);
    setIsOpen(false);
  }

  return (
    <div className={`select-switcher theme-switcher ${isOpen ? 'open' : ''}`} ref={switcherRef}>
      <button
        className="select-switcher-button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('common.theme')}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={`theme-swatch ${selectedTheme.id}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="select-switcher-copy">
          <strong>{selectedTheme.name}</strong>
          <small>{themeCodes[selectedTheme.id]}</small>
        </span>
        <span className="select-switcher-chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div className="select-switcher-menu" role="listbox" aria-label={t('common.theme')}>
          {themes.map((item) => (
            <button
              className={`select-switcher-option ${theme === item.id ? 'active' : ''}`}
              type="button"
              key={item.id}
              role="option"
              aria-selected={theme === item.id}
              onClick={() => handleChange(item.id)}
            >
              <span className={`theme-swatch ${item.id}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>{themeIcons[item.id]} {themeCodes[item.id]}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
