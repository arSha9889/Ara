import { cloneElement, isValidElement, useCallback, useState } from 'react';

import { BrandMark } from '../components/BrandMark.jsx';
import { ThemeLanguageControls } from '../components/ThemeLanguageControls.jsx';
import { WorkspaceIcon as Icon } from '../components/WorkspaceIcon.jsx';

export function AuthLayout({ children, preferences, updatePreferences, t, onBack, variant }) {
  const [cardBack, setCardBack] = useState(null);
  const handleCardBackChange = useCallback((nextBack) => setCardBack(nextBack), []);
  const enhancedChildren = isValidElement(children)
    ? cloneElement(children, { onCardBackChange: handleCardBackChange })
    : children;
  const backLabel = cardBack ? t('common.back') : t('auth.returnToWelcome');

  return (
    <main className={`auth-screen auth-scene is-${variant}`}>
      <div className="auth-scene-preferences">
        <ThemeLanguageControls preferences={preferences} updatePreferences={updatePreferences} t={t} compact presentation="auth" />
      </div>
      <div className="auth-wallpaper" aria-hidden="true" />
      <section className="auth-glass-card">
        <button className="auth-card-back" type="button" aria-label={backLabel} title={backLabel} disabled={cardBack?.disabled} onClick={cardBack?.onClick || onBack}><Icon name="arrow-left" size={18} /></button>
        <div className="auth-card-brand"><BrandMark /></div>
        <div className="auth-card-scroll">
          {enhancedChildren}
        </div>
      </section>
    </main>
  );
}
