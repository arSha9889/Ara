import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AppShell } from './layout/AppShell.jsx';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { LoginPage } from '../features/auth/pages/LoginPage.jsx';
import { RegisterPage } from '../features/auth/pages/RegisterPage.jsx';
import { LandingPage } from '../features/onboarding/pages/LandingPage.jsx';
import { OnboardingPage } from '../features/onboarding/pages/OnboardingPage.jsx';
import { ChatPage } from '../features/chats/pages/ChatPage.jsx';
import { ChatsPage } from '../features/chats/pages/ChatsPage.jsx';
import { NewChatPage } from '../features/chats/pages/NewChatPage.jsx';
import { PublicBranchesPage } from '../features/chats/pages/PublicBranchesPage.jsx';
import { PrivacyPolicyPage } from '../features/legal/pages/PrivacyPolicyPage.jsx';
import { TermsPage } from '../features/legal/pages/TermsPage.jsx';
import { LegalAcceptancePage } from '../features/legal/pages/LegalAcceptancePage.jsx';
import { ProfilePage } from '../features/profile/pages/ProfilePage.jsx';
import { SettingsPage } from '../features/settings/pages/SettingsPage.jsx';
import { AdminPage } from '../features/admin/pages/AdminPage.jsx';
import { AraChatLoader } from '../shared/ui/AraChatLoader.jsx';
import { AppFeedbackViewport } from '../shared/ui/AppFeedbackViewport.jsx';
import { useSession } from './providers/SessionProvider.jsx';


function AdminRoute() {
  const { session } = useSession();

  return session.user?.is_official
    ? <AdminPage />
    : <Navigate to="/app" replace />;
}

function ChatRoute() {
  const { chatId } = useParams();
  return <ChatPage key={chatId} />;
}


export function App() {
  const { isSessionLoading } = useSession();

  if (isSessionLoading) {
    return (
      <main className="app-boot-loader-page">
        <section className="panel boot-loader-panel">
          <AraChatLoader hero />
        </section>
      </main>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/region" element={<Navigate to="/register" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/legal/acceptance" element={<LegalAcceptancePage />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<ChatsPage />} />
            <Route path="new-chat" element={<NewChatPage />} />
            <Route path="branches" element={<PublicBranchesPage />} />
            <Route path="chats/:chatId" element={<ChatRoute />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppFeedbackViewport />
    </>
  );
}
