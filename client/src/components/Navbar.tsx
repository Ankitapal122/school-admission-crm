import React from 'react';
import { useAuthStore } from '../stores/authStore';

interface NavbarProps {
  currentTab: string;
  onOpenNewLead: () => void;
  onSelectTab: (tab: string) => void;
  onToggleMobileMenu?: () => void;
  onShowToast?: (msg: string) => void;
  wireframeScreenNum?: number;
}

export default function Navbar({
  currentTab,
  onOpenNewLead,
  onSelectTab,
  onToggleMobileMenu,
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
        <button
          className="mobile-menu-btn"
          onClick={onToggleMobileMenu}
          aria-label="Open navigation menu"
          title="Menu"
        >
          <span>☰</span>
        </button>
        <h1 className="page-title">{formatPageTitle(currentTab)}</h1>
        {previewRole && (
          <div className="preview-badge-banner">
            <span>👁️</span> PREVIEW MODE: Viewing interface as{' '}
            <strong>{previewRole === 'SENIOR_MANAGER' ? 'MANAGER' : 'COUNSELLOR'}</strong> (Admin
            permissions intact)
            <button
              className="btn btn-sm btn-outline"
              style={{ marginLeft: '6px', padding: '2px 6px' }}
              onClick={() => handlePreviewChange('')}
            >
              Exit Preview
            </button>
          </div>
        )}
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
        >
          <span>🔔</span>
          <span className="dot"></span>
        </button>

        <button className="btn btn-primary btn-sm" onClick={onOpenNewLead}>
          ➕ New Lead
        </button>
      </div>
    </header>
  );
}
