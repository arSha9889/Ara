import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from '../providers/SessionProvider.jsx';
import { AraChatLoader } from '../../shared/ui/AraChatLoader.jsx';

export function ProtectedRoute() {
  const { session, isSessionLoading } = useSession();
  const location = useLocation();

  if (isSessionLoading) {
    return (
      <main className="app-boot-loader-page">
        <section className="panel boot-loader-panel">
          <AraChatLoader hero />
        </section>
      </main>
    );
  }

  if (!session.accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!session.user?.legal_documents_current && location.pathname !== '/legal/acceptance') {
    return <Navigate to="/legal/acceptance" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
