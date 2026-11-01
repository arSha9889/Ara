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
      <div className="auth-wallpaper" aria-hidden="true" />
      <section className="auth-showcase" aria-labelledby="auth-showcase-title">
        <BrandMark />
        <div className="auth-showcase-copy">
          <h1 id="auth-showcase-title">{t('auth.showcaseTitle')} <strong>{t('auth.showcaseTitleAccent')}</strong></h1>
          <p>{t('auth.showcaseText')}</p>
        </div>
        <ul className="auth-showcase-features">
          <li><span aria-hidden="true"><Icon name="calls" size={24} /></span><div><strong>{t('auth.showcaseCallsTitle')}</strong><small>{t('auth.showcaseCallsText')}</small></div></li>
          <li><span aria-hidden="true"><Icon name="shield" size={24} /></span><div><strong>{t('auth.showcaseSecurityTitle')}</strong><small>{t('auth.showcaseSecurityText')}</small></div></li>
          <li><span aria-hidden="true"><Icon name="groups" size={24} /></span><div><strong>{t('auth.showcasePeopleTitle')}</strong><small>{t('auth.showcasePeopleText')}</small></div></li>
        </ul>
        <div className="auth-showcase-landscape" aria-hidden="true"><i /><i /><i /><span>A</span></div>
        <p className="auth-showcase-footer">AraChat <b>•</b> {t('auth.showcaseFooter')}</p>
      </section>
      <section className="auth-glass-card">
        <button className="auth-card-back" type="button" aria-label={backLabel} title={backLabel} disabled={cardBack?.disabled} onClick={cardBack?.onClick || onBack}><Icon name="arrow-left" size={18} /></button>
        <header className="auth-card-header">
          <div className="auth-card-mobile-brand"><BrandMark compact /></div>
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
