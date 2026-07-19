import { Navigate, Outlet } from 'react-router-dom';

import { useSession } from '../providers/SessionProvider.jsx';

export function ProtectedRoute() {
  const { session, isSessionLoading } = useSession();

  if (isSessionLoading) {
    return null;
  }

  if (!session.accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
