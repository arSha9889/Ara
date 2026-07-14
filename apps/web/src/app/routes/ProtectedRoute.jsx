import { Navigate, Outlet } from 'react-router-dom';

import { useSession } from '../providers/SessionProvider.jsx';
import { NexusLoader } from '../../shared/ui/NexusLoader.jsx';

export function ProtectedRoute() {
  const { session, isSessionLoading } = useSession();

  if (isSessionLoading) {
    return (
      <main className="auth-page boot-loader-page">
        <section className="panel boot-loader-panel">
          <NexusLoader />
        </section>
      </main>
    );
  }

  if (!session.accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
