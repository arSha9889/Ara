import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from '../providers/SessionProvider.jsx';

export function ProtectedRoute() {
  const { session, isSessionLoading } = useSession();
  const location = useLocation();

  if (isSessionLoading) {
    return null;
  }

  if (!session.accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
