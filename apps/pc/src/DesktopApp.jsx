import { useEffect, useRef, useState } from 'react';

import { Titlebar } from './components/Titlebar.jsx';
import { AraButton } from './components/AraButton.jsx';
import { openLegalDocument } from './features/legal/openLegalDocument.js';
import {
  notificationPermissionStatus,
  requestDesktopNotificationPermission,
} from './features/notifications/desktopNotifications.js';
import { shouldPromptForNotificationPermission } from './features/notifications/notificationPermissionPrompt.js';
import { translate } from './i18n/copy.js';
import { usePreferences } from './hooks/usePreferences.js';
import { useSession } from './hooks/useSession.js';
import { AuthLayout } from './screens/AuthLayout.jsx';
import { LoginScreen } from './screens/LoginScreen.jsx';
import { RegisterScreen } from './screens/RegisterScreen.jsx';
import { WelcomeScreen } from './screens/WelcomeScreen.jsx';
import { WorkspaceScreen } from './screens/WorkspaceScreen.jsx';
import { logoutDesktopSession } from './features/auth/authApi.js';
import { initializeNativeLiquidGlass } from './shared/nativeLiquidGlass.js';

function NotificationPermissionDialog({ isRequesting, onDismiss, onEnable, t }) {
  return (
    <section className="dialog-layer notification-permission-layer" role="dialog" aria-modal="true" aria-labelledby="notification-permission-title" aria-describedby="notification-permission-description">
      <div className="legal-dialog notification-permission-dialog">
        <p className="dialog-kicker">{t('workspace.settingsPanel.notificationPermissionPromptKicker')}</p>
        <h2 id="notification-permission-title">{t('workspace.settingsPanel.notificationPermissionPromptTitle')}</h2>
        <p id="notification-permission-description">{t('workspace.settingsPanel.notificationPermissionPromptText')}</p>
        <div className="notification-permission-actions">
          <AraButton type="button" variant="secondary" onClick={onDismiss} disabled={isRequesting}>{t('workspace.settingsPanel.notificationPermissionPromptLater')}</AraButton>
          <AraButton type="button" variant="primary" onClick={onEnable} disabled={isRequesting} autoFocus>{isRequesting ? t('workspace.settingsPanel.notificationPermissionRequesting') : t('workspace.settingsPanel.notificationPermissionPromptEnable')}</AraButton>
        </div>
      </div>
    </section>
  );
}

export function DesktopApp() {
  const [preferences, updatePreferences] = usePreferences();
  const { clearSession, getRefreshToken, isSessionLoading, saveSession, session, updateSessionUser } = useSession();
  const [route, setRoute] = useState('welcome');
  const [hasNativeLiquidGlass, setHasNativeLiquidGlass] = useState(false);
  const [isNotificationPermissionPromptOpen, setIsNotificationPermissionPromptOpen] = useState(false);
  const [isRequestingNotificationPermission, setIsRequestingNotificationPermission] = useState(false);
  const didRestoreRoute = useRef(false);
  const nativeLiquidGlassInitialization = useRef(null);
  const notificationPermissionSessionRef = useRef(null);
  const t = (path, variables) => translate(preferences.language, path, variables);

  useEffect(() => {
    nativeLiquidGlassInitialization.current ??= initializeNativeLiquidGlass();

    void nativeLiquidGlassInitialization.current.then((isEnabled) => {
      if (isEnabled) setHasNativeLiquidGlass(true);
    });
  }, []);

  useEffect(() => {
    if (isSessionLoading || didRestoreRoute.current) return;
    didRestoreRoute.current = true;
    if (session.accessToken) setRoute('workspace');
  }, [isSessionLoading, session.accessToken]);

  useEffect(() => {
    if (isSessionLoading || !session.accessToken) {
      notificationPermissionSessionRef.current = null;
      setIsNotificationPermissionPromptOpen(false);
      return undefined;
    }

    const sessionKey = session.user?.id ?? session.accessToken;
    if (notificationPermissionSessionRef.current === sessionKey) return undefined;
    notificationPermissionSessionRef.current = sessionKey;

    let isActive = true;
    void notificationPermissionStatus()
      .then((permission) => {
        if (isActive && shouldPromptForNotificationPermission({
          desktopNotifications: preferences.desktopNotifications,
          permission,
        })) {
          setIsNotificationPermissionPromptOpen(true);
        }
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [isSessionLoading, preferences.desktopNotifications, session.accessToken, session.user?.id]);

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

  async function enableDesktopNotifications() {
    if (isRequestingNotificationPermission) return;
    setIsRequestingNotificationPermission(true);
    try {
      const permission = await requestDesktopNotificationPermission();
      updatePreferences({ desktopNotifications: permission === 'granted' });
    } catch {
      updatePreferences({ desktopNotifications: false });
    } finally {
      setIsRequestingNotificationPermission(false);
      setIsNotificationPermissionPromptOpen(false);
    }
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
      ? <LoginScreen language={preferences.language} t={t} onNavigate={setRoute} onOpenLegal={handleOpenLegalDocument} onAuthenticated={handleAuthenticated} />
      : <RegisterScreen language={preferences.language} t={t} onNavigate={setRoute} onOpenLegal={handleOpenLegalDocument} onAuthenticated={handleAuthenticated} />;

    return (
      <AuthLayout preferences={preferences} updatePreferences={updatePreferences} t={t} onBack={() => setRoute('welcome')} onNavigate={setRoute} variant={route}>
        {form}
      </AuthLayout>
    );
  }

  return (
    <div className={`desktop-app${hasNativeLiquidGlass ? ' has-native-liquid-glass' : ''}`}>
      {!hasNativeLiquidGlass && <Titlebar t={t} />}
      <div className="desktop-content">{renderScreen()}</div>
      {isNotificationPermissionPromptOpen ? <NotificationPermissionDialog isRequesting={isRequestingNotificationPermission} onDismiss={() => setIsNotificationPermissionPromptOpen(false)} onEnable={() => void enableDesktopNotifications()} t={t} /> : null}
    </div>
  );
}
