import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth, RequireRole } from './auth/guards';
import { AppLayout } from './components/AppLayout';
import { ToastProvider } from './components/Toast';
import { CategoriesPage } from './pages/CategoriesPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ClientDetailPage, ClientsPage } from './pages/ClientsPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { VerifyRecoveryEmailPage } from './pages/VerifyRecoveryEmailPage';
import { ProjectAdminPage } from './pages/admin/ProjectAdminPage';
import { ProjectFormPage } from './pages/admin/ProjectFormPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/verify-recovery-email" element={<VerifyRecoveryEmailPage />} />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<OverviewPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:slug" element={<ProjectDetailPage />} />
              <Route path="favorites" element={<ProjectsPage mode="favorites" />} />
              <Route path="recent" element={<ProjectsPage mode="recent" />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:slug" element={<ClientDetailPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="resources" element={<ResourcesPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="admin/projects" element={<RequireRole roles={['super_admin', 'project_admin']}><ProjectAdminPage /></RequireRole>} />
              <Route path="admin/projects/new" element={<RequireRole roles={['super_admin']}><ProjectFormPage /></RequireRole>} />
              <Route path="admin/projects/:id/edit" element={<RequireRole roles={['super_admin', 'project_admin']}><ProjectFormPage /></RequireRole>} />
              <Route path="admin/users" element={<RequireRole roles={['super_admin']}><UsersPage /></RequireRole>} />
              <Route path="admin/settings" element={<RequireRole roles={['super_admin']}><SettingsPage /></RequireRole>} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </ErrorBoundary>
  );
}
