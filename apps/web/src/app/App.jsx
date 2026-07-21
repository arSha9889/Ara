import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './layout/AppShell.jsx';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { LoginPage } from '../features/auth/pages/LoginPage.jsx';
import { RegisterPage } from '../features/auth/pages/RegisterPage.jsx';
import { LandingPage } from '../features/onboarding/pages/LandingPage.jsx';
import { OnboardingPage } from '../features/onboarding/pages/OnboardingPage.jsx';
import { ChatPage } from '../features/chats/pages/ChatPage.jsx';
import { ChatsPage } from '../features/chats/pages/ChatsPage.jsx';
import { WelcomeChatPage } from '../features/chats/pages/WelcomeChatPage.jsx';
import { PrivacyPolicyPage } from '../features/legal/pages/PrivacyPolicyPage.jsx';
import { TermsPage } from '../features/legal/pages/TermsPage.jsx';
import { ProfilePage } from '../features/profile/pages/ProfilePage.jsx';
import { SettingsPage } from '../features/settings/pages/SettingsPage.jsx';
import { NexusLoader } from '../shared/ui/NexusLoader.jsx';
import { useSession } from './providers/SessionProvider.jsx';

export function App() {
  const { isSessionLoading } = useSession();

  if (isSessionLoading) {
    return (
      <main className="app-boot-loader-page">
        <section className="panel boot-loader-panel">
          <NexusLoader />
        </section>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<ChatsPage />} />
          <Route path="welcome" element={<WelcomeChatPage />} />
          <Route path="chats/:chatId" element={<ChatPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
