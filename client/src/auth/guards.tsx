import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthContext';
import type { Role } from '../lib/types';
import { FullScreenLoader, StateMessage } from '../components/ui';

/** Client-side guard for navigation only. The API enforces every permission independently. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return (
      <StateMessage
        tone="error"
        icon={<ShieldAlert size={28} />}
        title="Access restricted"
        message="This area is available to authorised administrators only. If you need access, contact your Janyutech administrator."
      />
    );
  }
  return <>{children}</>;
}
