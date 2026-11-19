import React from 'react';
import { useAuthStore } from '../stores/authStore';
import { normalizeRoleKey } from '../lib/roles';
import CrmIcon from './CrmIcon';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenNewLead?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  leadsCount?: number;
}

export default function Sidebar({
  currentTab,
  onSelectTab,
  onOpenNewLead,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
  leadsCount = 3,
}: SidebarProps) {
  const { user, previewRole, logout } = useAuthStore();
  const effectiveRole = previewRole || user?.role || 'SUPER_ADMIN';

  const norm = normalizeRoleKey(effectiveRole);
  const roleName =
    norm === 'super_admin'
      ? 'admin'
      : norm === 'manager'
      ? 'manager'
      : 'counsellor';

  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const initials = (user?.fullName || 'User')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick('dashboard');
          }}
          className="sidebar-brand"
          title="BoardingEdu CRM"
        >
          <div className="brand-icon" style={{ background: '#FFFFFF', padding: '3px', overflow: 'hidden' }}>
            <img
              src="/boardingedu-logo.png"
              alt="BoardingEdu"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <div className="brand-title">BoardingEdu</div>
            <div className="brand-subtitle" style={{ textTransform: 'none', fontSize: '9.5px' }}>
              Connecting Future &amp; Schools
            </div>
          </div>
        </a>
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          title="Full Screen Dashboard (Hide Sidebar)"
          aria-label="Collapse sidebar to view full dashboard"
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          className="sidebar-close-mobile-btn"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          title="Close"
        >
          <CrmIcon name="x" size={18} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <div style={{ padding: '4px 10px 10px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              sessionStorage.removeItem('pwa_install_dismissed');
              window.dispatchEvent(new CustomEvent('pwa-show-install-prompt'));
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '9px 12px',
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
            }}
            title="Install BoardingEdu CRM on Phone or Desktop"
          >
            <span style={{ fontSize: '15px' }}>📲</span>
            <span>Install App on Phone</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              window.dispatchEvent(new CustomEvent('crm-open-whatsapp-bot'));
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '9px 12px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
            }}
            title="WhatsApp Auto-Reply Bot: Scan QR Code or Link Phone Number"
          >
            <span style={{ fontSize: '15px' }}>📱</span>
            <span>WhatsApp Bot (QR)</span>
          </button>
        </div>
        {roleName === 'admin' && (
          <>
            <a
              className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavClick('dashboard')}
            >
              <span className="nav-icon"><CrmIcon name="home" size={17} /></span>
              <span>Dashboard</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'managers' ? 'active' : ''}`}
              onClick={() => handleNavClick('managers')}
            >
              <span className="nav-icon"><CrmIcon name="user-cog" size={17} /></span>
              <span>Manager Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'counsellors' ? 'active' : ''}`}
              onClick={() => handleNavClick('counsellors')}
            >
              <span className="nav-icon"><CrmIcon name="user-check" size={17} /></span>
              <span>Counsellor Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'teams' ? 'active' : ''}`}
              onClick={() => handleNavClick('teams')}
            >
              <span className="nav-icon"><CrmIcon name="users" size={17} /></span>
              <span>Team Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'leads' ? 'active' : ''}`}
              onClick={() => handleNavClick('leads')}
            >
              <span className="nav-icon"><CrmIcon name="file-text" size={17} /></span>
              <span>Lead Management</span>
              <span className="nav-badge danger">{leadsCount || 12}</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'lead-verification' ? 'active' : ''}`}
              onClick={() => handleNavClick('lead-verification')}
            >
              <span className="nav-icon"><CrmIcon name="check-square" size={17} /></span>
              <span>Lead Verification</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => handleNavClick('whatsapp')}
            >
              <span className="nav-icon"><CrmIcon name="message-square" size={17} /></span>
              <span>Parent Communication</span>
              <span className="nav-badge success" style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' }}>QR BOT</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'schools' ? 'active' : ''}`}
              onClick={() => handleNavClick('schools')}
            >
              <span className="nav-icon"><CrmIcon name="school" size={17} /></span>
              <span>School Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'ai' ? 'active' : ''}`}
              onClick={() => handleNavClick('ai')}
            >
              <span className="nav-icon"><CrmIcon name="lightbulb" size={17} /></span>
              <span>School Recommendations</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'admissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('admissions')}
            >
              <span className="nav-icon"><CrmIcon name="graduation-cap" size={17} /></span>
              <span>Admission Tracking</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'school-visits' ? 'active' : ''}`}
              onClick={() => handleNavClick('school-visits')}
            >
              <span className="nav-icon"><CrmIcon name="calendar" size={17} /></span>
              <span>School Visits &amp; Meetings</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'fee-installments' ? 'active' : ''}`}
              onClick={() => handleNavClick('fee-installments')}
            >
              <span className="nav-icon"><CrmIcon name="credit-card" size={17} /></span>
              <span>Fee &amp; Installment Mgmt</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'commissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('commissions')}
            >
              <span className="nav-icon"><CrmIcon name="rupee" size={17} /></span>
              <span>Commission Management</span>
              <span className="nav-badge" style={{ fontSize: '9px', fontWeight: 800, padding: '2px 5px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>29-30</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'employee-monitoring' ? 'active' : ''}`}
              onClick={() => handleNavClick('employee-monitoring')}
            >
              <span className="nav-icon"><CrmIcon name="activity" size={17} /></span>
              <span>Employee Monitoring</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => handleNavClick('reports')}
            >
              <span className="nav-icon"><CrmIcon name="bar-chart" size={17} /></span>
              <span>Reports &amp; Analytics</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'audit-logs' ? 'active' : ''}`}
              onClick={() => handleNavClick('audit-logs')}
            >
              <span className="nav-icon"><CrmIcon name="shield" size={17} /></span>
              <span>Audit Log Viewer</span>
              <span className="nav-badge" style={{ fontSize: '9px', fontWeight: 800, padding: '2px 5px', background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' }}>Screen 31</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'notifications' ? 'active' : ''}`}
              onClick={() => handleNavClick('notifications')}
            >
              <span className="nav-icon"><CrmIcon name="bell" size={17} /></span>
              <span>Notifications</span>
              <span className="nav-badge danger">24</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'activity-logs' ? 'active' : ''}`}
              onClick={() => handleNavClick('activity-logs')}
            >
              <span className="nav-icon"><CrmIcon name="clipboard" size={17} /></span>
              <span>Activity Logs</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'roles-permissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('roles-permissions')}
            >
              <span className="nav-icon"><CrmIcon name="shield" size={17} /></span>
              <span>Roles &amp; Permissions</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleNavClick('settings')}
            >
              <span className="nav-icon"><CrmIcon name="settings" size={17} /></span>
              <span>Settings</span>
            </a>
            <a
              className="nav-item"
              style={{ color: '#10B981', fontWeight: 700 }}
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
                sessionStorage.removeItem('pwa_install_dismissed');
                window.dispatchEvent(new CustomEvent('pwa-show-install-prompt'));
              }}
            >
              <span className="nav-icon">📲</span>
              <span>Install Mobile App</span>
            </a>
          </>
        )}

        {roleName === 'manager' && (
          <>
            <a
              className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavClick('dashboard')}
            >
              <span className="nav-icon"><CrmIcon name="home" size={17} /></span>
              <span>Dashboard</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'counsellors' || currentTab === 'teams' ? 'active' : ''}`}
              onClick={() => handleNavClick('counsellors')}
            >
              <span className="nav-icon"><CrmIcon name="users" size={17} /></span>
              <span>My Team</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'leads' ? 'active' : ''}`}
              onClick={() => handleNavClick('leads')}
            >
              <span className="nav-icon"><CrmIcon name="file-text" size={17} /></span>
              <span>Leads</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'lead-verification' ? 'active' : ''}`}
              onClick={() => handleNavClick('lead-verification')}
            >
              <span className="nav-icon"><CrmIcon name="check-square" size={17} /></span>
              <span>Lead Verification</span>
              <span className="nav-badge danger">{leadsCount || 12}</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => handleNavClick('whatsapp')}
            >
              <span className="nav-icon"><CrmIcon name="message-square" size={17} /></span>
              <span>Parent Communication</span>
              <span className="nav-badge success" style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' }}>QR BOT</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'schools' ? 'active' : ''}`}
              onClick={() => handleNavClick('schools')}
            >
              <span className="nav-icon"><CrmIcon name="school" size={17} /></span>
              <span>School Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'ai' ? 'active' : ''}`}
              onClick={() => handleNavClick('ai')}
            >
              <span className="nav-icon"><CrmIcon name="lightbulb" size={17} /></span>
              <span>School Recommendations</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'admissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('admissions')}
            >
              <span className="nav-icon"><CrmIcon name="graduation-cap" size={17} /></span>
              <span>Admission Tracking</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'school-visits' ? 'active' : ''}`}
              onClick={() => handleNavClick('school-visits')}
            >
              <span className="nav-icon"><CrmIcon name="calendar" size={17} /></span>
              <span>School Visits &amp; Meetings</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'fee-installments' ? 'active' : ''}`}
              onClick={() => handleNavClick('fee-installments')}
            >
              <span className="nav-icon"><CrmIcon name="credit-card" size={17} /></span>
              <span>Fee &amp; Installment Mgmt</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'commissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('commissions')}
            >
              <span className="nav-icon"><CrmIcon name="rupee" size={17} /></span>
              <span>Commission</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => handleNavClick('reports')}
            >
              <span className="nav-icon"><CrmIcon name="bar-chart" size={17} /></span>
              <span>Reports &amp; Analytics</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'notifications' ? 'active' : ''}`}
              onClick={() => handleNavClick('notifications')}
            >
              <span className="nav-icon"><CrmIcon name="bell" size={17} /></span>
              <span>Notifications</span>
              <span className="nav-badge danger">8</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleNavClick('settings')}
            >
              <span className="nav-icon"><CrmIcon name="settings" size={17} /></span>
              <span>Settings</span>
            </a>
            <a
              className="nav-item"
              style={{ color: '#10B981', fontWeight: 700 }}
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
                sessionStorage.removeItem('pwa_install_dismissed');
                window.dispatchEvent(new CustomEvent('pwa-show-install-prompt'));
              }}
            >
              <span className="nav-icon">📲</span>
              <span>Install Mobile App</span>
            </a>
          </>
        )}

        {roleName === 'counsellor' && (
          <>
            {/* Counsellor Top Profile Card matching reference image */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px 14px',
                marginBottom: '6px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3B82F6, #EC4899)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                    border: '2px solid rgba(255,255,255,0.45)',
                  }}
                >
                  {user?.fullName && !user.fullName.includes('Admin')
                    ? initials.toUpperCase()
                    : 'CO'}
                </div>
                <span
                  style={{
                    position: 'absolute',
                    bottom: '0px',
                    right: '0px',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#22C55E',
                    border: '2px solid #0B1F44',
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                  {user?.fullName && !user.fullName.includes('Admin')
                    ? user.fullName
                    : 'Counsellor'}
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                  Counsellor <CrmIcon name="chevron-down" size={12} />
                </div>
              </div>
            </div>

            <a
              className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavClick('dashboard')}
            >
              <span className="nav-icon"><CrmIcon name="home" size={17} /></span>
              <span>Dashboard</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'leads' ? 'active' : ''}`}
              onClick={() => handleNavClick('leads')}
            >
              <span className="nav-icon"><CrmIcon name="user-check" size={17} /></span>
              <span>My Leads</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'create-lead' ? 'active' : ''}`}
              onClick={() => {
                if (onOpenNewLead) onOpenNewLead();
                if (onCloseMobile) onCloseMobile();
              }}
            >
              <span className="nav-icon"><CrmIcon name="plus-circle" size={17} /></span>
              <span>Add Lead</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'commissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('commissions')}
            >
              <span className="nav-icon"><CrmIcon name="rupee" size={17} /></span>
              <span>My Commission</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => handleNavClick('whatsapp')}
            >
              <span className="nav-icon"><CrmIcon name="phone-call" size={17} /></span>
              <span>Calls &amp; Messages</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'school-visits' ? 'active' : ''}`}
              onClick={() => handleNavClick('school-visits')}
            >
              <span className="nav-icon"><CrmIcon name="calendar" size={17} /></span>
              <span>Visit Schedule</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'followups' ? 'active' : ''}`}
              onClick={() => handleNavClick('followups')}
            >
              <span className="nav-icon"><CrmIcon name="calendar-clock" size={17} /></span>
              <span>Reschedule Visit</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'ai' || currentTab === 'schools' ? 'active' : ''}`}
              onClick={() => handleNavClick('ai')}
            >
              <span className="nav-icon"><CrmIcon name="school" size={17} /></span>
              <span>Suggested Schools</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'sessions' ? 'active' : ''}`}
              onClick={() => handleNavClick('sessions')}
            >
              <span className="nav-icon"><CrmIcon name="user" size={17} /></span>
              <span>Profile</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleNavClick('settings')}
            >
              <span className="nav-icon"><CrmIcon name="settings" size={17} /></span>
              <span>Settings</span>
            </a>
            <a
              className="nav-item"
              style={{ color: '#10B981', fontWeight: 700 }}
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
                sessionStorage.removeItem('pwa_install_dismissed');
                window.dispatchEvent(new CustomEvent('pwa-show-install-prompt'));
              }}
            >
              <span className="nav-icon">📲</span>
              <span>Install Mobile App</span>
            </a>
            <a
              className="nav-item"
              onClick={() => logout(true)}
            >
              <span className="nav-icon"><CrmIcon name="logout" size={17} /></span>
              <span>Logout</span>
            </a>

            {/* Need Help? Contact Manager Card */}
            <a
              href="https://wa.me/919876543210?text=Hello%20Manager%2C%20I%20need%20help%20with%20a%20student%20lead."
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: '14px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textDecoration: 'none',
                color: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CrmIcon name="headphones" size={18} color="#93C5FD" />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700 }}>Need Help?</div>
                  <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Contact Manager</div>
                </div>
              </div>
              <CrmIcon name="chevron-right" size={14} color="#94A3B8" />
            </a>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-mini-profile">
          <div className="avatar">{roleName === 'admin' ? 'SA' : initials}</div>
          <div>
            <div className="user-meta-name">
              {roleName === 'admin' ? 'Super Admin' : user?.fullName || 'User'}
            </div>
            <div className="user-meta-role">{roleName.toUpperCase()}</div>
          </div>
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => logout(true)}
          title="Logout"
          style={{ color: '#CBD5E1', borderColor: 'rgba(255,255,255,0.2)' }}
        >
          <CrmIcon name="logout" size={15} />
        </button>
      </div>
    </aside>
  );
}
