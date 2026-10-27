import { Navigate, Route, Routes } from 'react-router-dom';

import { LandingPage } from '../features/onboarding/pages/LandingPage.jsx';
import { DownloadPage } from '../features/onboarding/pages/DownloadPage.jsx';
import { NewsPage } from '../features/onboarding/pages/NewsPage.jsx';
import { NewsArticlePage } from '../features/onboarding/pages/NewsArticlePage.jsx';
import { PrivacyPolicyPage } from '../features/legal/pages/PrivacyPolicyPage.jsx';
import { TermsPage } from '../features/legal/pages/TermsPage.jsx';
import { AdminPage } from '../features/admin/pages/AdminPage.jsx';
import { AdminLoginPage } from '../features/admin/pages/AdminLoginPage.jsx';
import { SubscriptionPreviewPage } from '../features/subscription/pages/SubscriptionPreviewPage.jsx';
import { useSession } from './providers/SessionProvider.jsx';


function AdminRoute() {
  const { session, isSessionLoading } = useSession();

  if (isSessionLoading) return null;
  return session.user?.is_official ? <AdminPage /> : <Navigate to="/admin/login" replace />;
}


export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/download" element={<DownloadPage />} />
      <Route path="/news" element={<NewsPage />} />
      <Route path="/news/:slug" element={<NewsArticlePage />} />
      <Route path="/subscription" element={<SubscriptionPreviewPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="/app/*" element={<Navigate to="/" replace />} />
      <Route path="/login/*" element={<Navigate to="/" replace />} />
      <Route path="/register/*" element={<Navigate to="/" replace />} />
      <Route path="/password-recovery/*" element={<Navigate to="/" replace />} />
      <Route path="/onboarding/*" element={<Navigate to="/" replace />} />
      <Route path="/region/*" element={<Navigate to="/" replace />} />
      <Route path="/legal/acceptance" element={<Navigate to="/" replace />} />
      <Route path="/presentation" element={<Navigate to="/" replace />} />
      <Route path="/messenger" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
