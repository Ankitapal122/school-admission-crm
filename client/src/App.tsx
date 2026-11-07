import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { apiCall } from './lib/api';
import LoginPage from './features/auth/LoginPage';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import RoleDashboard from './features/dashboard/RoleDashboard';
import {
  LeadsView,
  TeamsView,
  UsersView,
  AdmissionsView,
  CommissionsView,
  SchoolsView,
  FollowUpsView,
  AIView,
  WhatsAppView,
  ReportsView,
  AuthenticatorSetupView,
  SessionsView,
  SettingsView,
  CreateLeadModal,
} from './features/views/CrmViews';

export default function App() {
  const { isAuthenticated, user, previewRole } = useAuthStore();
  const queryClient = useQueryClient();

  const [currentTab, setCurrentTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [wireframeScreenNum, setWireframeScreenNum] = useState(1);
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    type: 'success' | 'danger' | 'warning';
  } | null>(null);

  const showToast = (
    text: string,
    type: 'success' | 'danger' | 'warning' = 'success'
  ) => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const effectiveRole = previewRole || user?.role || 'SUPER_ADMIN';
  const roleParam =
    effectiveRole === 'SUPER_ADMIN'
      ? 'admin'
      : effectiveRole === 'SENIOR_MANAGER'
      ? 'manager'
      : 'counsellor';

  // TanStack Query hooks for live PostgreSQL data
  const { data: statsRes } = useQuery({
    queryKey: ['dashboard-stats', roleParam],
    queryFn: () => apiCall(`/reports/dashboard-stats?role=${roleParam}`),
    enabled: isAuthenticated,
  });

  const { data: leadsRes } = useQuery({
    queryKey: ['leads'],
    queryFn: () => apiCall('/leads'),
    enabled: isAuthenticated,
  });

  const { data: schoolsRes } = useQuery({
    queryKey: ['schools'],
    queryFn: () => apiCall('/schools'),
    enabled: isAuthenticated,
  });

  const { data: commissionsRes } = useQuery({
    queryKey: ['commissions'],
    queryFn: () => apiCall('/commissions'),
    enabled: isAuthenticated,
  });

  const { data: followUpsRes } = useQuery({
    queryKey: ['followups'],
    queryFn: () => apiCall('/followups'),
    enabled: isAuthenticated,
  });

  const { data: teamsRes } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiCall('/teams'),
    enabled: isAuthenticated,
  });

  const { data: admissionsRes } = useQuery({
    queryKey: ['admissions'],
    queryFn: () => apiCall('/admissions'),
    enabled: isAuthenticated,
  });

  const { data: usersRes } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiCall('/users'),
    enabled: isAuthenticated,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['schools'] });
    queryClient.invalidateQueries({ queryKey: ['commissions'] });
    queryClient.invalidateQueries({ queryKey: ['followups'] });
    queryClient.invalidateQueries({ queryKey: ['teams'] });
    queryClient.invalidateQueries({ queryKey: ['admissions'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  // If not logged in, show the exact BoardingEdu Login Page (manual credentials required)
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const leads = leadsRes?.leads || [];
  const schools = schoolsRes?.schools || [];
  const commissions = commissionsRes?.commissions || [];
  const followUps = followUpsRes?.followUps || [];
  const teams = teamsRes?.teams || [];
  const admissions = admissionsRes?.admissions || [];
  const users = usersRes?.users || [];
  const kpiStats = statsRes?.stats || {};

  return (
    <>
      {/* Toast Notifications Container matching original index.html */}
      <div className="toast-container" id="toastContainer">
        {toastMsg && (
          <div className={`toast ${toastMsg.type}`}>
            <span>
              {toastMsg.type === 'success'
                ? '✅'
                : toastMsg.type === 'danger'
                ? '❌'
                : '⚠️'}
            </span>{' '}
            <span>{toastMsg.text}</span>
          </div>
        )}
      </div>

      <div className="app-layout">
        {/* Dark Navy Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onOpenNewLead={() => setIsLeadModalOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          leadsCount={leads.length || 3}
        />

        {/* Mobile Backdrop */}
        <div
          className={`sidebar-backdrop ${mobileMenuOpen ? 'active' : ''}`}
          id="sidebarBackdrop"
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Main Content Wrapper */}
        <div className={`main-wrapper ${sidebarCollapsed ? 'expanded' : ''}`}>
          {/* Topbar */}
          <Navbar
            currentTab={currentTab}
            onOpenNewLead={() => setIsLeadModalOpen(true)}
            onSelectTab={setCurrentTab}
            onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
            onShowToast={showToast}
            wireframeScreenNum={wireframeScreenNum}
          />

          <main className="content-body">
            {currentTab === 'dashboard' && (
              <RoleDashboard
                onNavigateTab={setCurrentTab}
                onOpenNewLead={() => setIsLeadModalOpen(true)}
                leads={leads}
                commissions={commissions}
                schools={schools}
                teams={teams}
                kpiStats={kpiStats}
              />
            )}

            {(currentTab === 'leads' || currentTab === 'lead-verification') && (
              <LeadsView
                leads={leads}
                schools={schools}
                users={users}
                onOpenNewLead={() => setIsLeadModalOpen(true)}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'teams' && (
              <TeamsView
                teams={teams}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'users' && (
              <UsersView
                users={users}
                teams={teams}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'admissions' && (
              <AdmissionsView
                admissions={admissions}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'commissions' && (
              <CommissionsView
                commissions={commissions}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'schools' && (
              <SchoolsView
                schools={schools}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'followups' && (
              <FollowUpsView
                followUps={followUps}
                leads={leads}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'ai' && <AIView onShowToast={showToast} />}

            {currentTab === 'whatsapp' && <WhatsAppView onShowToast={showToast} />}

            {currentTab === 'reports' && <ReportsView onShowToast={showToast} />}

            {currentTab === 'authenticator-setup' && (
              <AuthenticatorSetupView onShowToast={showToast} />
            )}

            {currentTab === 'sessions' && <SessionsView onShowToast={showToast} />}

            {currentTab === 'settings' && <SettingsView onShowToast={showToast} />}
          </main>
        </div>

        {/* Create Lead Modal */}
        <CreateLeadModal
          isOpen={isLeadModalOpen}
          onClose={() => setIsLeadModalOpen(false)}
          schools={schools}
          onSuccess={refreshAll}
          onShowToast={showToast}
        />
      </div>
    </>
  );
}
