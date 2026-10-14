import { useEffect, useRef, useState } from 'react';

import { Titlebar } from './components/Titlebar.jsx';
import { openLegalDocument } from './features/legal/openLegalDocument.js';
import { translate } from './i18n/copy.js';
import { usePreferences } from './hooks/usePreferences.js';
import { useSession } from './hooks/useSession.js';
import { AuthLayout } from './screens/AuthLayout.jsx';
import { LoginScreen } from './screens/LoginScreen.jsx';
import { RegisterScreen } from './screens/RegisterScreen.jsx';
import { WelcomeScreen } from './screens/WelcomeScreen.jsx';
import { WorkspaceScreen } from './screens/WorkspaceScreen.jsx';
import { logoutDesktopSession } from './features/auth/authApi.js';

export function DesktopApp() {
  const [preferences, updatePreferences] = usePreferences();
  const { clearSession, getRefreshToken, isSessionLoading, saveSession, session, updateSessionUser } = useSession();
  const [route, setRoute] = useState('welcome');
  const didRestoreRoute = useRef(false);
  const t = (path, variables) => translate(preferences.language, path, variables);

  useEffect(() => {
    if (isSessionLoading || didRestoreRoute.current) return;
    didRestoreRoute.current = true;
    if (session.accessToken) setRoute('workspace');
  }, [isSessionLoading, session.accessToken]);

  async function handleAuthenticated(nextSession, options) {
    await saveSession(nextSession, options);
    setRoute('workspace');
  }

  async function handleLogout() {
    const refreshToken = await getRefreshToken();
    if (refreshToken) await logoutDesktopSession(refreshToken).catch(() => undefined);
    await clearSession();
    setRoute('login');
  }

  function handleOpenLegalDocument(documentType) {
    void openLegalDocument(documentType);
  }

  function renderScreen() {
    if (isSessionLoading) {
      return <main className="session-loading" aria-live="polite">{t('auth.restoringSession')}</main>;
    }

    if (route === 'welcome') {
      return <WelcomeScreen preferences={preferences} updatePreferences={updatePreferences} t={t} onNavigate={setRoute} onOpenLegal={handleOpenLegalDocument} />;
    }

    if (route === 'workspace') {
      return <WorkspaceScreen accessToken={session.accessToken} currentUser={session.user} currentUserId={session.user?.id} preferences={preferences} updatePreferences={updatePreferences} t={t} onCurrentUserUpdated={updateSessionUser} onLogout={handleLogout} />;
    }

    const form = route === 'login'
      ? <LoginScreen t={t} onNavigate={setRoute} onOpenLegal={handleOpenLegalDocument} onAuthenticated={handleAuthenticated} />
      : <RegisterScreen language={preferences.language} t={t} onNavigate={setRoute} onOpenLegal={handleOpenLegalDocument} onAuthenticated={handleAuthenticated} />;

    return (
      <AuthLayout preferences={preferences} updatePreferences={updatePreferences} t={t} onBack={() => setRoute('welcome')} variant={route}>
        {form}
      </AuthLayout>
    );
  }

  return (
    <div className="desktop-app">
      <Titlebar t={t} />
      <div className="desktop-content">{renderScreen()}</div>
    </div>
  );
}
