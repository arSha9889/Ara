import { useEffect, useRef, useState } from 'react';

import { BrandMark, parrotIcon } from '../components/BrandMark.jsx';
import { ThemeLanguageControls } from '../components/ThemeLanguageControls.jsx';

export function WelcomeScreen({ preferences, updatePreferences, t, onNavigate, onOpenLegal }) {
  const transitionTimerRef = useRef(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsRevealed(true), 900);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  function skipScene() {
    setIsRevealed(true);
  }

  function startTransition(destination) {
    setIsLeaving(true);
    updatePreferences({ hasSeenWelcome: true });
    transitionTimerRef.current = window.setTimeout(() => onNavigate(destination), 440);
  }

  return (
    <main className={`welcome-screen ${isRevealed ? 'is-revealed' : ''} ${isLeaving ? 'is-leaving' : ''}`}>
      <div className="welcome-utility-bar">
        <button className="text-button skip-button" type="button" onClick={skipScene}>{t('common.skip')}</button>
        <ThemeLanguageControls preferences={preferences} updatePreferences={updatePreferences} t={t} />
      </div>

      <section className="brand-scene" aria-label={t('welcome.visualScene')}>
        <span className="brand-scene-glow" aria-hidden="true" />
        <span className="brand-route brand-route-one" aria-hidden="true" />
        <span className="brand-route brand-route-two" aria-hidden="true" />
        <div className="brand-emblem" aria-hidden="true">
          <span className="brand-emblem-ring brand-emblem-ring-one" />
          <span className="brand-emblem-ring brand-emblem-ring-two" />
          <div className="brand-emblem-icon"><img src={parrotIcon} alt="" /></div>
        </div>
        <span className="brand-feather" aria-hidden="true" />
        <p className="brand-scene-message">{t('welcome.friendMessage')}</p>
      </section>

      <section className="welcome-content" aria-labelledby="welcome-heading">
        <BrandMark />
        <div className="welcome-copy">
          <h1 id="welcome-heading">{t('welcome.greeting')}</h1>
          <p>{t('welcome.subtitle')}</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-primary" type="button" onClick={() => startTransition('login')}>{t('welcome.logIn')}</button>
          <button className="button button-secondary" type="button" onClick={() => startTransition('register')}>{t('welcome.createAccount')}</button>
        </div>
        <p className="welcome-legal">
          {t('welcome.legalBefore')}
          <button type="button" onClick={() => onOpenLegal('privacy')}>{t('welcome.privacy')}</button>
          {t('welcome.legalJoin')}
          <button type="button" onClick={() => onOpenLegal('terms')}>{t('welcome.terms')}</button>.
        </p>
      </section>
      <span className="exit-feather" aria-hidden="true" />
    </main>
  );
}
