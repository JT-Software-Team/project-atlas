export type Role = 'super_admin' | 'admin' | 'project_admin' | 'viewer';
export const ROLES: Role[] = ['super_admin', 'admin', 'project_admin', 'viewer'];

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  clientId: number | null;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionTokenHash?: string;
    }
  }
}
