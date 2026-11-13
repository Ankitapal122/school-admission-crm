import React from 'react';
import { useAuthStore } from '../stores/authStore';

interface NavbarProps {
  currentTab: string;
  onOpenNewLead: () => void;
  onSelectTab: (tab: string) => void;
  onToggleMobileMenu?: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  onShowToast?: (msg: string) => void;
  wireframeScreenNum?: number;
}

export default function Navbar({
  currentTab,
  onOpenNewLead,
  onSelectTab,
  onToggleMobileMenu,
  onToggleSidebar,
  sidebarCollapsed = false,
  onShowToast,
  wireframeScreenNum = 1,
}: NavbarProps) {
  const { user, previewRole, setPreviewRole } = useAuthStore();

  const formatPageTitle = (view: string) => {
    const titles: Record<string, string> = {
      dashboard: 'Operational Dashboard',
      leads: 'Student & Parent Lead Management',
      'lead-verification': 'Lead Verification & Quality Approval',
      teams: 'Team Structure & Reassignment',
      users: 'Employee & Role Permissions',
      admissions: 'Admission Pipeline & Confirmed Revenue',
      commissions: 'Commission Ledger & Reversal Management',
      schools: 'Uttarakhand Boarding Schools Master (500)',
      followups: 'Parent Follow-up Calendar & Call Outcomes',
      whatsapp: 'WhatsApp Business API & Email Centre',
      ai: 'AI Intelligence Hub & School Recommender',
      reports: 'Enterprise Analytics & Conversion Reports',
      'authenticator-setup': 'Two-Factor Authentication Setup',
      sessions: 'Active Device Sessions & Revocation',
      settings: 'System Configuration & Timers',
    };
    return titles[view] || 'Uttarakhand Boarding CRM';
  };

  const handlePreviewChange = (val: string) => {
    if (!val) {
      setPreviewRole(null);
      if (onShowToast) onShowToast('Returned to Admin Control Dashboard');
    } else {
      setPreviewRole(val as any);
      const label = val === 'SENIOR_MANAGER' ? 'MANAGER' : 'COUNSELLOR';
      if (onShowToast) onShowToast(`Switched to ${label} Preview Mode`);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {sidebarCollapsed && (
          <button
            className="sidebar-expand-btn desktop-only"
            onClick={onToggleSidebar}
            title="Open Sidebar Navigation"
            aria-label="Expand sidebar"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <img
              src="/boardingedu-logo.png"
              alt="Logo"
              style={{ width: '20px', height: '20px', objectFit: 'contain' }}
            />
            <span className="expand-brand-pill">BoardingEdu CRM</span>
          </button>
        )}
        <button
          className="mobile-menu-btn"
          onClick={onToggleMobileMenu}
          aria-label="Open navigation menu"
          title="Menu"
        >
          <span>☰</span>
        </button>
        <h1 className="page-title">{formatPageTitle(currentTab)}</h1>
      </div>

      <div className="topbar-right">
        {/* Admin Dashboard Switcher Preview Feature */}
        {user?.role === 'SUPER_ADMIN' && (
          <div className="dashboard-switcher">
            <label>Dashboard Preview:</label>
            <select
              className="dashboard-select"
              value={previewRole || ''}
              onChange={(e) => handlePreviewChange(e.target.value)}
            >
              <option value="">Admin (Full Control)</option>
              <option value="SENIOR_MANAGER">Manager View Preview</option>
              <option value="COUNSELLOR">Counsellor View Preview</option>
            </select>
          </div>
        )}

        <button
          className="topbar-btn"
          onClick={() =>
            onShowToast
              ? onShowToast(
                  'You have 3 real-time alerts: Follow-ups due and new lead verification pending.'
                )
              : undefined
          }
          aria-label="Notifications"
        >
          <span>🔔</span>
          <span className="dot"></span>
        </button>

        <button className="btn btn-primary btn-sm" onClick={onOpenNewLead}>
          ➕ <span className="hidden sm:inline">New </span>Lead
        </button>
      </div>

      {previewRole && (
        <div className="preview-badge-banner">
          <div>
            <span>👁️</span> PREVIEW MODE: Viewing interface as{' '}
            <strong>{previewRole === 'SENIOR_MANAGER' ? 'MANAGER' : 'COUNSELLOR'}</strong> (Admin
            permissions intact)
          </div>
          <button
            className="btn btn-sm btn-outline"
            style={{ marginLeft: '6px', padding: '2px 8px' }}
            onClick={() => handlePreviewChange('')}
          >
            Exit Preview
          </button>
        </div>
      )}
    </header>
  );
}
