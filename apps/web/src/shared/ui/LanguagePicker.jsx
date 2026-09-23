import { useMemo, useState } from 'react';

import { useI18n } from '../../app/providers/I18nProvider.jsx';
import { Icon } from './Icon.jsx';

export const LANGUAGE_OPTIONS = [
  { id: 'ru', label: 'Русский', icon: '🇷🇺', code: 'RU', searchTerms: ['russian', 'русский'] },
  { id: 'en', label: 'English', icon: '🇬🇧', code: 'EN', searchTerms: ['english', 'английский'] },
  { id: 'kk', label: 'Қазақша', icon: '🇰🇿', code: 'KK', searchTerms: ['kazakh', 'қазақша', 'казахский'] },
  { id: 'ky', label: 'Кыргызча', icon: '🇰🇬', code: 'KY', searchTerms: ['kyrgyz', 'кыргызча', 'киргизский'] },
  { id: 'uk', label: 'Українська', icon: '🇺🇦', code: 'UK', searchTerms: ['ukrainian', 'українська', 'украинский'] },
  { id: 'be', label: 'Беларуская', icon: '🇧🇾', code: 'BE', searchTerms: ['belarusian', 'беларуская', 'белорусский'] },
  { id: 'uz', label: 'O‘zbekcha', icon: '🇺🇿', code: 'UZ', searchTerms: ['uzbek', 'o‘zbekcha', 'узбекский'] },
];

export const PUBLIC_LANGUAGE_IDS = ['ru', 'en'];

export function getLanguageOption(language) {
  return LANGUAGE_OPTIONS.find((item) => item.id === language) ?? LANGUAGE_OPTIONS[0];
}

function matchesSearch(item, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return [item.label, item.code, ...item.searchTerms]
    .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}

export function LanguagePickerList({ selectedLanguage, onSelect, inputRef, publicOnly = false }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const visibleOptions = useMemo(
    () => LANGUAGE_OPTIONS.filter((item) => (
      (!publicOnly || PUBLIC_LANGUAGE_IDS.includes(item.id))
      && matchesSearch(item, query)
    )),
    [publicOnly, query],
  );

  return (
    <div className="language-picker">
      {!publicOnly ? (
        <label className="language-picker-search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('settings.languageSearchPlaceholder')}
            aria-label={t('settings.languageSearch')}
          />
        </label>
      ) : null}
      {visibleOptions.length ? (
        <div className="language-picker-options" role="listbox" aria-label={t('settings.language')}>
          {visibleOptions.map((item) => {
            const isSelected = item.id === selectedLanguage;
            return (
              <button
                className={`language-picker-option ${isSelected ? 'active' : ''}`}
                type="button"
                key={item.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(item.id)}
              >
                <span className="language-picker-flag" aria-hidden="true">{item.icon}</span>
                <span className="language-picker-copy">
                  <strong>{item.label}</strong>
                  <small>{item.code}</small>
                </span>
                {isSelected ? <span className="language-picker-check" aria-hidden="true"><Icon name="check" size={17} /></span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="language-picker-empty" role="status">
          <span><Icon name="search" size={20} /></span>
          <p>{t('settings.languageSearchEmpty')}</p>
        </div>
      )}
      {publicOnly ? <p className="language-picker-notice" role="note"><Icon name="settings" size={17} />{t('settings.publicLanguageNotice')}</p> : null}
    </div>
  );
}
