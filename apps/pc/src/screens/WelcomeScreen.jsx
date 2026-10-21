import { useEffect, useRef, useState } from 'react';

import { BrandMark } from '../components/BrandMark.jsx';
import { ThemeLanguageControls } from '../components/ThemeLanguageControls.jsx';

export function WelcomeScreen({ preferences, updatePreferences, t, onNavigate, onOpenLegal }) {
  const transitionTimerRef = useRef(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsRevealed(true), 120);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  function startTransition(destination) {
    if (isLeaving) return;
    setIsLeaving(true);
    updatePreferences({ hasSeenWelcome: true });
    const transitionDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 340;
    transitionTimerRef.current = window.setTimeout(() => onNavigate(destination), transitionDuration);
  }

  return (
    <main className={`welcome-screen ${isRevealed ? 'is-revealed' : ''} ${isLeaving ? 'is-leaving' : ''}`}>
      <div className="welcome-utility-bar">
        <ThemeLanguageControls preferences={preferences} updatePreferences={updatePreferences} t={t} compact presentation="auth" />
      </div>

      <div className="auth-wallpaper" aria-hidden="true" />

      <section className="welcome-content welcome-hero" aria-labelledby="welcome-heading">
        <BrandMark />
        <div className="welcome-copy">
          <h1 id="welcome-heading">{t('welcome.greeting')}</h1>
          <p>{t('welcome.subtitle')}</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-primary button-full" type="button" onClick={() => startTransition('register')}>{t('welcome.startChat')}</button>
        </div>
        <p className="welcome-signin">{t('auth.already')} <button type="button" onClick={() => startTransition('login')}>{t('auth.signIn')}</button></p>
        <p className="welcome-legal">
          {t('welcome.legalBefore')}
          <button type="button" onClick={() => onOpenLegal('privacy')}>{t('welcome.privacy')}</button>
          {t('welcome.legalJoin')}
          <button type="button" onClick={() => onOpenLegal('terms')}>{t('welcome.terms')}</button>.
        </p>
      </section>
    </main>
  );
}
