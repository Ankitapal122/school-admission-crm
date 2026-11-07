import React from 'react';
import { useAuthStore } from '../stores/authStore';

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

  const roleName =
    effectiveRole === 'SUPER_ADMIN'
      ? 'admin'
      : effectiveRole === 'SENIOR_MANAGER'
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
        >
          <div className="brand-icon">🏔️</div>
          <div>
            <div className="brand-title">BoardingEdu CRM</div>
            <div className="brand-subtitle">Uttarakhand Schools</div>
          </div>
        </a>
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          title="Toggle Sidebar"
        >
          {collapsed ? '→' : '←'}
        </button>
        <button
          className="sidebar-close-mobile-btn"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          title="Close"
        >
          ✕
        </button>
      </div>

      <nav className="sidebar-nav">
        {roleName === 'admin' && (
          <>
            <div className="nav-section-title">ADMIN CORE</div>
            <a
              className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavClick('dashboard')}
            >
              <span className="nav-icon">📊</span>
              <span>Organization Dashboard</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'leads' ? 'active' : ''}`}
              onClick={() => handleNavClick('leads')}
            >
              <span className="nav-icon">📥</span>
              <span>Lead Management</span>
              <span className="nav-badge danger">{leadsCount}</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'admissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('admissions')}
            >
              <span className="nav-icon">🎓</span>
              <span>Admission Tracking</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'commissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('commissions')}
            >
              <span className="nav-icon">💰</span>
              <span>Commission Management</span>
              <span className="nav-badge warning">Ledger</span>
            </a>

            <div className="nav-section-title">MANAGEMENT &amp; SCHOOLS</div>
            <a
              className={`nav-item ${currentTab === 'teams' ? 'active' : ''}`}
              onClick={() => handleNavClick('teams')}
            >
              <span className="nav-icon">👥</span>
              <span>Team Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'users' ? 'active' : ''}`}
              onClick={() => handleNavClick('users')}
            >
              <span className="nav-icon">👤</span>
              <span>User Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'schools' ? 'active' : ''}`}
              onClick={() => handleNavClick('schools')}
            >
              <span className="nav-icon">🏫</span>
              <span>Uttarakhand Schools (500)</span>
            </a>

            <div className="nav-section-title">AUTOMATION &amp; INTELLIGENCE</div>
            <a
              className={`nav-item ${currentTab === 'ai' ? 'active' : ''}`}
              onClick={() => handleNavClick('ai')}
            >
              <span className="nav-icon">🧠</span>
              <span>AI Intelligence</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => handleNavClick('whatsapp')}
            >
              <span className="nav-icon">📱</span>
              <span>WhatsApp &amp; Email Centre</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'followups' ? 'active' : ''}`}
              onClick={() => handleNavClick('followups')}
            >
              <span className="nav-icon">📅</span>
              <span>Follow-up Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => handleNavClick('reports')}
            >
              <span className="nav-icon">📈</span>
              <span>Reports &amp; Analytics</span>
            </a>

            <div className="nav-section-title">SECURITY &amp; SYSTEM</div>
            <a
              className={`nav-item ${currentTab === 'authenticator-setup' ? 'active' : ''}`}
              onClick={() => handleNavClick('authenticator-setup')}
            >
              <span className="nav-icon">🛡️</span>
              <span>2FA &amp; Security</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'sessions' ? 'active' : ''}`}
              onClick={() => handleNavClick('sessions')}
            >
              <span className="nav-icon">💻</span>
              <span>Active Sessions</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleNavClick('settings')}
            >
              <span className="nav-icon">⚙️</span>
              <span>System Settings</span>
            </a>
          </>
        )}

        {roleName === 'manager' && (
          <>
            <div className="nav-section-title">MANAGER CONSOLE</div>
            <a
              className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavClick('dashboard')}
            >
              <span className="nav-icon">📊</span>
              <span>Team Dashboard</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'leads' ? 'active' : ''}`}
              onClick={() => handleNavClick('leads')}
            >
              <span className="nav-icon">📥</span>
              <span>Team Leads</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'lead-verification' ? 'active' : ''}`}
              onClick={() => handleNavClick('lead-verification')}
            >
              <span className="nav-icon">✅</span>
              <span>Lead Verification</span>
              <span className="nav-badge danger">Review</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'admissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('admissions')}
            >
              <span className="nav-icon">🎓</span>
              <span>Admission Tracking</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'commissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('commissions')}
            >
              <span className="nav-icon">💰</span>
              <span>Team Commission</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'schools' ? 'active' : ''}`}
              onClick={() => handleNavClick('schools')}
            >
              <span className="nav-icon">🏫</span>
              <span>School Directory</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'followups' ? 'active' : ''}`}
              onClick={() => handleNavClick('followups')}
            >
              <span className="nav-icon">📅</span>
              <span>Follow-up Management</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => handleNavClick('whatsapp')}
            >
              <span className="nav-icon">📱</span>
              <span>WhatsApp Inbox</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
              onClick={() => handleNavClick('reports')}
            >
              <span className="nav-icon">📈</span>
              <span>Team Reports</span>
            </a>
          </>
        )}

        {roleName === 'counsellor' && (
          <>
            <div className="nav-section-title">COUNSELLOR DESK</div>
            <a
              className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavClick('dashboard')}
            >
              <span className="nav-icon">📊</span>
              <span>My Dashboard</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'leads' ? 'active' : ''}`}
              onClick={() => handleNavClick('leads')}
            >
              <span className="nav-icon">📥</span>
              <span>My Assigned Leads</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'create-lead' ? 'active' : ''}`}
              onClick={() => {
                if (onOpenNewLead) onOpenNewLead();
                if (onCloseMobile) onCloseMobile();
              }}
            >
              <span className="nav-icon">➕</span>
              <span>Create New Lead</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'admissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('admissions')}
            >
              <span className="nav-icon">🎓</span>
              <span>My Admissions</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'commissions' ? 'active' : ''}`}
              onClick={() => handleNavClick('commissions')}
            >
              <span className="nav-icon">💰</span>
              <span>My Commission</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'followups' ? 'active' : ''}`}
              onClick={() => handleNavClick('followups')}
            >
              <span className="nav-icon">📅</span>
              <span>Follow-up Calendar</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'schools' ? 'active' : ''}`}
              onClick={() => handleNavClick('schools')}
            >
              <span className="nav-icon">🏫</span>
              <span>School Directory</span>
            </a>
            <a
              className={`nav-item ${currentTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => handleNavClick('whatsapp')}
            >
              <span className="nav-icon">📱</span>
              <span>WhatsApp &amp; Templates</span>
            </a>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-mini-profile">
          <div className="avatar">{initials}</div>
          <div>
            <div className="user-meta-name">{user?.fullName || 'User'}</div>
            <div className="user-meta-role">{roleName.toUpperCase()}</div>
          </div>
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={logout}
          title="Logout"
          style={{ color: '#CBD5E1', borderColor: 'rgba(255,255,255,0.2)' }}
        >
          🚪
        </button>
      </div>
    </aside>
  );
}
