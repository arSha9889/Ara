import { BrandMark } from '../components/BrandMark.jsx';
import { ThemeLanguageControls } from '../components/ThemeLanguageControls.jsx';

export function AuthLayout({ children, preferences, updatePreferences, t, onBack, variant }) {
  return (
    <main className="auth-screen">
      <aside className={`auth-aside is-${variant}`}>
        <button className="back-button" type="button" onClick={onBack}>← {t('auth.returnToWelcome')}</button>
        <div className="auth-aside-orbit orbit-a" aria-hidden="true" />
        <div className="auth-aside-orbit orbit-b" aria-hidden="true" />
        <div className="auth-aside-content">
          <BrandMark />
          <p className="auth-aside-line">{variant === 'login' ? t('auth.loginText') : t('auth.registerText')}</p>
        </div>
        <div className="auth-aside-feathers" aria-hidden="true"><i /><i /><i /></div>
      </aside>
      <section className="auth-panel">
        <div className="auth-panel-utility">
          <ThemeLanguageControls preferences={preferences} updatePreferences={updatePreferences} t={t} compact />
        </div>
        {children}
      </section>
    </main>
  );
}
