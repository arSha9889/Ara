import { useEffect, useRef, useState } from 'react';

import { BrandMark, parrotIcon } from '../components/BrandMark.jsx';
import { ThemeLanguageControls } from '../components/ThemeLanguageControls.jsx';

export function WelcomeScreen({ preferences, updatePreferences, t, onNavigate, onOpenLegal }) {
  const sceneRef = useRef(null);
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

  function handlePointerMove(event) {
    const scene = sceneRef.current;
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = scene.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    scene.style.setProperty('--gaze-x', x.toFixed(2));
    scene.style.setProperty('--gaze-y', y.toFixed(2));
  }

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

      <section className="parrot-scene" ref={sceneRef} onPointerMove={handlePointerMove} aria-label={t('welcome.visualFallback')}>
        <span className="scene-orb scene-orb-one" aria-hidden="true" />
        <span className="scene-orb scene-orb-two" aria-hidden="true" />
        <span className="scene-light scene-light-one" aria-hidden="true" />
        <div className="tree-branch" aria-hidden="true"><i /><i /><i /></div>
        <span className="feather feather-one" aria-hidden="true" />
        <span className="feather feather-two" aria-hidden="true" />
        <span className="feather feather-three" aria-hidden="true" />
        <div className="parrot-stage" aria-hidden="true">
          <span className="parrot-halo" />
          <img className="parrot-render" src={parrotIcon} alt="" />
          <span className="parrot-gaze" />
        </div>
        <p className="parrot-bubble">{t('welcome.friendMessage')}</p>
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
        <button
          className={`sound-control ${preferences.soundEnabled ? 'is-active' : ''}`}
          type="button"
          onClick={() => updatePreferences({ soundEnabled: !preferences.soundEnabled })}
          aria-pressed={preferences.soundEnabled}
          aria-describedby="sound-help"
        >
          <span className="sound-control-icon" aria-hidden="true">⌁</span>
          {preferences.soundEnabled ? t('welcome.soundOff') : t('welcome.soundOn')}
        </button>
        <p id="sound-help" className="sound-help">{t('welcome.soundUnavailable')}</p>
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
