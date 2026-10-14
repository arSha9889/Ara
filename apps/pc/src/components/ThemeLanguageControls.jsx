import { SUPPORTED_LANGUAGES } from '../i18n/copy.js';

export function ThemeToggle({ preferences, updatePreferences, t, compact = false }) {
  return (
    <button
      className={`theme-toggle ${compact ? 'is-compact' : ''}`}
      type="button"
      onClick={() => updatePreferences({ theme: preferences.theme === 'dark' ? 'light' : 'dark' })}
      aria-label={`${t('common.theme')}: ${preferences.theme === 'dark' ? t('common.dark') : t('common.light')}`}
    >
      {preferences.theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.64 5.64 7.2 7.2M16.8 16.8l1.56 1.56M18.36 5.64 16.8 7.2M7.2 16.8l-1.56 1.56M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.1A8.3 8.3 0 0 1 8.9 4 8.5 8.5 0 1 0 20 15.1Z" /></svg>
      )}
    </button>
  );
}

export function ThemeLanguageControls({ preferences, updatePreferences, t, compact = false }) {
  return (
    <div className={`preference-controls ${compact ? 'is-compact' : ''}`}>
      <label className="select-control">
        <span className="sr-only">{t('common.language')}</span>
        <select value={preferences.language} onChange={(event) => updatePreferences({ language: event.target.value })} aria-label={t('common.language')}>
          {SUPPORTED_LANGUAGES.map((language) => <option value={language.id} key={language.id}>{language.label}</option>)}
        </select>
      </label>
      <ThemeToggle preferences={preferences} updatePreferences={updatePreferences} t={t} compact={compact} />
    </div>
  );
}
