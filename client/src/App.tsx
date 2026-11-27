import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { apiCall } from './lib/api';
import { hasRole, normalizeRoleKey } from './lib/roles';
import LoginPage from './features/auth/LoginPage';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import CrmIcon from './components/CrmIcon';
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
import LeadReportModal from './features/leads/LeadReportModal';
import AuditLogViewer from './features/analytics/AuditLogViewer';
import PrivacyComplianceView, { FirstLoginPrivacyModal } from './features/views/PrivacyComplianceView';
import { UserProfileView } from './features/profile/UserProfileView';
import PwaInstallPrompt from './components/PwaInstallPrompt';

export default function App() {
  const { isAuthenticated, user, previewRole, logout } = useAuthStore();
  const queryClient = useQueryClient();

  const [currentTab, setCurrentTabState] = useState<string>(() => {
    try {
      return sessionStorage.getItem('crm_active_tab') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const setCurrentTab = (tab: string) => {
    setCurrentTabState(tab);
    try {
      sessionStorage.setItem('crm_active_tab', tab);
    } catch {}
  };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [createdReportLead, setCreatedReportLead] = useState<any | null>(null);
  const [wireframeScreenNum] = useState(1);
  const [needsPrivacyAccept, setNeedsPrivacyAccept] = useState(false);
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

  // Reset active tab cleanly when switching accounts / logging out so real Manager/Counsellor never inherits Admin's tab
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setCurrentTab('dashboard');
      return;
    }
    const actualRoleKey = normalizeRoleKey(user.role);
    const adminOnlyTabs = ['managers', 'users', 'teams', 'audit-logs', 'roles-permissions', 'employee-monitoring'];
    if (actualRoleKey !== 'super_admin' && adminOnlyTabs.includes(currentTab)) {
      setCurrentTab('dashboard');
    }
  }, [isAuthenticated, user?.id, user?.role]);

  // Persistent session + role-based auto-logout (Admin: 1 month, Manager: 1 week, Counsellor: 1 week) + live presence heartbeat every 30s
  // Also enforce mandatory Privacy Policy acceptance on first login
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setNeedsPrivacyAccept(false);
      return;
    }

    // Role-based session duration auto-logout check
    const checkSessionExpiry = () => {
      const expiresAtStr = localStorage.getItem('crm_session_expires_at');
      const num = expiresAtStr ? Number(expiresAtStr) : NaN;
      const expiresAt = !Number.isNaN(num) && num > 0 ? num : (expiresAtStr ? Date.parse(expiresAtStr) : NaN);

      if (!Number.isNaN(expiresAt) && expiresAt > 0) {
        if (Date.now() >= expiresAt) {
          const roleKey = normalizeRoleKey(user.role);
          const roleLabel =
            roleKey === 'super_admin' ? 'Admin' : roleKey === 'manager' ? 'Manager' : 'Counsellor';
          const periodLabel = roleKey === 'super_admin' ? '1 month' : '1 week';
          logout(true);
          showToast(
            `${roleLabel} session has expired after ${periodLabel}. Please enter your email and password to log in again.`,
            'warning'
          );
        }
      } else {
        // Auto-initialize expiration if absent so refreshing never logs out
        const roleKey = normalizeRoleKey(user.role);
        const durationDays = roleKey === 'super_admin' ? 30 : 7;
        const defaultExpiry = Date.now() + durationDays * 24 * 60 * 60 * 1000;
        try {
          localStorage.setItem('crm_session_expires_at', String(defaultExpiry));
        } catch {}
      }
    };
    checkSessionExpiry();
    const sessionInterval = setInterval(checkSessionExpiry, 30000);

    // Immediate heartbeat on login/mount + every 30s so user stays "Online" only while active in CRM
    const sendHeartbeat = () => {
      apiCall('/presence/heartbeat', 'POST', {}, { skipOfflineQueue: true }).catch(() => {});
    };
    sendHeartbeat();
    const hbInterval = setInterval(sendHeartbeat, 30000);

    const localKey = `crm_privacy_accepted_v2_${user.id}`;
    if (localStorage.getItem(localKey) !== 'true') {
      apiCall('/privacy/status', 'GET', null, { skipOfflineQueue: true })
        .then((res) => {
          const accepted = Boolean(res?.acceptedByCurrentUser ?? res?.data?.acceptedByCurrentUser);
          if (accepted) {
            try { localStorage.setItem(localKey, 'true'); } catch {}
            setNeedsPrivacyAccept(false);
          } else {
            setNeedsPrivacyAccept(true);
          }
        })
        .catch(() => {});
    }

    return () => {
      clearInterval(sessionInterval);
      clearInterval(hbInterval);
    };
  }, [isAuthenticated, user?.id]);

  const effectiveRole = previewRole || user?.role || 'SUPER_ADMIN';
  const normKey = normalizeRoleKey(effectiveRole);
  const roleParam =
    normKey === 'super_admin'
      ? 'admin'
      : normKey === 'manager'
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
    refetchInterval: 30000,
  });

  const {
    data: schoolsRes,
    isLoading: schoolsLoading,
    isError: schoolsError,
    error: schoolsErrObj,
    refetch: refetchSchools,
  } = useQuery({
    queryKey: ['schools'],
    queryFn: () => apiCall('/schools?limit=1500'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
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

  const { data: teamsRes, isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiCall('/teams'),
    enabled: isAuthenticated,
  });

  const { data: admissionsRes } = useQuery({
    queryKey: ['admissions'],
    queryFn: () => apiCall('/admissions'),
    enabled: isAuthenticated,
  });

  const { data: usersRes, isLoading: usersLoading } = useQuery({
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

  const refreshLeadsOnly = () => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['followups'] });
  };

  const handleLeadCreatedInstantly = (createdLead: any) => {
    if (!createdLead) return;
    // 1. Instantly prepend to React Query cache (0ms latency UI update!)
    queryClient.setQueryData(['leads'], (old: any) => {
      const existingList = Array.isArray(old?.leads)
        ? old.leads
        : Array.isArray(old?.data?.leads)
        ? old.data.leads
        : Array.isArray(old)
        ? old
        : [];
      const withoutDup = existingList.filter(
        (l: any) => (l.id && l.id !== createdLead.id) && (!l.leadNumber || l.leadNumber !== createdLead.leadNumber)
      );
      return {
        ...(typeof old === 'object' && old !== null ? old : {}),
        leads: [createdLead, ...withoutDup],
      };
    });
    // 2. Refresh query in background to ensure all relations sync
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    // 3. Instantly navigate to Leads workspace so user sees record immediately!
    setCurrentTab('leads');
    showToast(
      `Lead "${createdLead.studentName || 'Student'}" (${createdLead.leadNumber || 'New'}) added to top of table!`,
      'success'
    );
  };

  // If not logged in, show the exact BoardingEdu Login Page (manual credentials required) along with PWA Installer
  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <PwaInstallPrompt />
      </>
    );
  }

  const leads = leadsRes?.leads || [];
  const schools = schoolsRes?.schools || [];
  const commissions = commissionsRes?.commissions || [];
  const followUps = followUpsRes?.followUps || [];
  const teams = Array.isArray(teamsRes?.teams)
    ? teamsRes.teams
    : Array.isArray(teamsRes?.data)
    ? teamsRes.data
    : Array.isArray(teamsRes)
    ? teamsRes
    : [];
  const admissions = admissionsRes?.admissions || [];
  const users = Array.isArray(usersRes?.users)
    ? usersRes.users
    : Array.isArray(usersRes?.data)
    ? usersRes.data
    : Array.isArray(usersRes)
    ? usersRes
    : [];
  const kpiStats = statsRes?.stats || {};

  return (
    <>
      {/* Toast Notifications Container matching original index.html */}
      <div className="toast-container" id="toastContainer">
        {toastMsg && (
          <div className={`toast ${toastMsg.type}`}>
            <span>
              {toastMsg.type === 'success' ? (
                <CrmIcon name="check-circle" size={16} />
              ) : toastMsg.type === 'danger' ? (
                <CrmIcon name="x-circle" size={16} />
              ) : (
                <CrmIcon name="alert" size={16} />
              )}
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

        {/* Floating dock trigger when sidebar is collapsed */}
        {sidebarCollapsed && (
          <button
            className="sidebar-dock-trigger desktop-only"
            onClick={() => setSidebarCollapsed(false)}
            title="Expand Sidebar Navigation"
            aria-label="Expand sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* Main Content Wrapper */}
        <div className={`main-wrapper ${sidebarCollapsed ? 'expanded' : ''}`}>
          {/* Topbar */}
          <Navbar
            currentTab={currentTab}
            onOpenNewLead={() => setIsLeadModalOpen(true)}
            onSelectTab={setCurrentTab}
            onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            sidebarCollapsed={sidebarCollapsed}
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
                users={users}
                isLoading={teamsLoading}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {(currentTab === 'users' ||
              currentTab === 'managers' ||
              currentTab === 'counsellors' ||
              currentTab === 'employee-monitoring' ||
              currentTab === 'roles-permissions') && (
              <UsersView
                viewMode={
                  currentTab === 'managers'
                    ? 'managers'
                    : currentTab === 'counsellors'
                    ? 'counsellors'
                    : 'all'
                }
                isLoading={usersLoading}
                users={users}
                allUsers={users}
                teams={teams}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {(currentTab === 'admissions' ||
              currentTab === 'school-visits' ||
              currentTab === 'fee-installments') && (
              <AdmissionsView
                admissions={admissions}
                leads={leads}
                schools={schools}
                initialSubTab={
                  currentTab === 'school-visits'
                    ? 'virtual-tours'
                    : currentTab === 'fee-installments'
                    ? 'installments'
                    : 'applications'
                }
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'commissions' && (
              <CommissionsView
                commissions={commissions}
                users={users}
                schools={schools}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'schools' && (
              <SchoolsView
                schools={schools}
                isLoading={schoolsLoading}
                isError={schoolsError}
                errorMessage={(schoolsErrObj as any)?.message}
                onRetry={() => refetchSchools()}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {(currentTab === 'followups' || currentTab === 'notifications') && (
              <FollowUpsView
                followUps={followUps}
                leads={leads}
                onRefresh={refreshAll}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'ai' && <AIView onShowToast={showToast} />}

            {currentTab === 'whatsapp' && <WhatsAppView onShowToast={showToast} />}

            {currentTab === 'audit-logs' && (
              <AuditLogViewer onShowToast={showToast} />
            )}

            {(currentTab === 'reports' || currentTab === 'activity-logs') && (
              <ReportsView onShowToast={showToast} />
            )}

            {currentTab === 'authenticator-setup' && (
              <AuthenticatorSetupView onShowToast={showToast} />
            )}

            {currentTab === 'sessions' && <SessionsView onShowToast={showToast} />}

            {currentTab === 'profile' && <UserProfileView onShowToast={showToast} />}

            {currentTab === 'settings' && (
              normKey !== 'super_admin' ? (
                <UserProfileView onShowToast={showToast} isSettingsMode={true} />
              ) : (
                <SettingsView onShowToast={showToast} />
              )
            )}

            {currentTab === 'privacy-compliance' && (
              <PrivacyComplianceView onShowToast={showToast} />
            )}
          </main>
        </div>

        {/* Mandatory First-Login Privacy Policy Acceptance Modal */}
        <FirstLoginPrivacyModal
          isOpen={needsPrivacyAccept}
          onAccepted={() => {
            if (user?.id) {
              try { localStorage.setItem(`crm_privacy_accepted_v2_${user.id}`, 'true'); } catch {}
            }
            setNeedsPrivacyAccept(false);
          }}
          onShowToast={showToast}
        />

        {/* Create Lead Modal */}
        <CreateLeadModal
          isOpen={isLeadModalOpen}
          onClose={() => setIsLeadModalOpen(false)}
          schools={schools}
          onSuccess={(created) => {
            handleLeadCreatedInstantly(created);
          }}
          onShowToast={showToast}
        />

        {/* Student Lead Report Modal (Opened automatically on lead creation or via check) */}
        {createdReportLead && (
          <LeadReportModal
            lead={createdReportLead}
            schools={schools}
            onClose={() => setCreatedReportLead(null)}
            onRefresh={refreshAll}
            onShowToast={showToast}
          />
        )}

        {/* PWA Install Prompt & iOS Guide */}
        <PwaInstallPrompt />
      </div>
    </>
  );
}
