import { useTheme } from '../../app/providers/ThemeProvider.jsx';
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
  const { theme, setTheme } = useTheme();

  function handleChange(nextTheme) {
    setTheme(nextTheme);
    onChange?.(nextTheme);
  }

  return (
    <div className="segmented-control theme-segmented" role="radiogroup" aria-label="Theme">
      {themes.map((item) => (
        <button
          className={`segment-button icon-segment ${theme === item.id ? 'active' : ''}`}
          type="button"
          key={item.id}
          role="radio"
          aria-checked={theme === item.id}
          aria-label={item.name}
          title={item.name}
          onClick={() => handleChange(item.id)}
        >
          <span className={`theme-swatch ${item.id}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="segment-glyph" aria-hidden="true">{themeIcons[item.id]}</span>
          <span className="segment-code" aria-hidden="true">{themeCodes[item.id]}</span>
        </button>
      ))}
    </div>
  );
}
