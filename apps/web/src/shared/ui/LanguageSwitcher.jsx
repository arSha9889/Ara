import { useI18n } from '../../app/providers/I18nProvider.jsx';

export function LanguageSwitcher({ onChange }) {
  const { language, setLanguage } = useI18n();

  function handleChange(nextLanguage) {
    setLanguage(nextLanguage);
    onChange?.(nextLanguage);
  }

  return (
    <div className="segmented-control language-segmented" role="radiogroup" aria-label="Language">
      {[
        { id: 'ru', label: 'Русский', icon: '🇷🇺', code: 'RU' },
        { id: 'en', label: 'English', icon: '🇬🇧', code: 'EN' },
      ].map((item) => (
        <button
          className={`segment-button icon-segment ${language === item.id ? 'active' : ''}`}
          type="button"
          key={item.id}
          role="radio"
          aria-checked={language === item.id}
          aria-label={item.label}
          title={item.label}
          onClick={() => handleChange(item.id)}
        >
          <span className="segment-glyph flag" aria-hidden="true">{item.icon}</span>
          <span className="segment-code" aria-hidden="true">{item.code}</span>
        </button>
      ))}
    </div>
  );
}
