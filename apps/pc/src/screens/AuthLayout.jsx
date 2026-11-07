import { cloneElement, isValidElement, useCallback, useState } from 'react';

import { BrandMark } from '../components/BrandMark.jsx';
import { ThemeLanguageControls } from '../components/ThemeLanguageControls.jsx';
import { WorkspaceIcon as Icon } from '../components/WorkspaceIcon.jsx';

export function AuthLayout({ children, preferences, updatePreferences, t, onBack, onNavigate, variant }) {
  const [cardBack, setCardBack] = useState(null);
  const handleCardBackChange = useCallback((nextBack) => setCardBack(nextBack), []);
  const enhancedChildren = isValidElement(children)
    ? cloneElement(children, { onCardBackChange: handleCardBackChange })
    : children;
  const backLabel = cardBack ? t('common.back') : t('auth.returnToWelcome');
  const isRegister = variant === 'register';

  function navigate(destination) {
    if (destination === variant) return;
    onNavigate(destination);
  }

  return (
    <main className={`auth-screen auth-scene is-${variant}`}>
      <div className="auth-scene-preferences">
        <ThemeLanguageControls preferences={preferences} updatePreferences={updatePreferences} t={t} compact presentation="auth" />
      </div>
      <section className="auth-panel-card">
        <button className="auth-card-back" type="button" aria-label={backLabel} title={backLabel} disabled={cardBack?.disabled} onClick={cardBack?.onClick || onBack}><Icon name="arrow-left" size={18} /></button>
        <header className="auth-card-header">
          <div className="auth-card-brand"><BrandMark compact /></div>
          <nav className="auth-card-tabs" aria-label={t('auth.accessType')}>
            <button className={!isRegister ? 'is-active' : ''} type="button" aria-current={!isRegister ? 'page' : undefined} onClick={() => navigate('login')}><Icon name="profile" size={21} /><span>{t('auth.loginTab')}</span></button>
            <button className={isRegister ? 'is-active' : ''} type="button" aria-current={isRegister ? 'page' : undefined} onClick={() => navigate('register')}><Icon name="user-add" size={21} /><span>{t('auth.registerTab')}</span></button>
          </nav>
        </header>
        <div className="auth-card-scroll">
          {enhancedChildren}
        </div>
      </section>
    </main>
  );
}
