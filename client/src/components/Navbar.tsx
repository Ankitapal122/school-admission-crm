import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { apiCall, downloadApiFile, flushPendingOfflineMutations, getApiBase } from '../lib/api';
import { getPendingMutationCount } from '../lib/offlineDb';
import { hasRole } from '../lib/roles';
import CrmIcon from './CrmIcon';
import WhatsAppBotModal from './WhatsAppBotModal';

interface NavbarProps {
  currentTab: string;
  onOpenNewLead: () => void;
  onSelectTab: (tab: string) => void;
  onToggleMobileMenu?: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  onShowToast?: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
  wireframeScreenNum?: number;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
  relatedEntityType?: string | null;
}

const NOTIFICATION_EVENT_META: Record<
  string,
  { icon: string; label: string; bg: string; color: string }
> = {
  follow_up_reminder: { icon: 'bell', label: 'Follow-Up Reminder', bg: '#EFF6FF', color: '#1D4ED8' },
  weekly_report: { icon: 'calendar', label: 'Weekly Report', bg: '#F5F3FF', color: '#6D28D9' },
  merge_alert: { icon: 'refresh', label: 'Merge Alert', bg: '#FEF3C7', color: '#B45309' },
  report_ready: { icon: 'bar-chart', label: 'Report Ready', bg: '#ECFDF5', color: '#047857' },
  commission_reversed: { icon: 'rotate-ccw', label: 'Commission Reversed', bg: '#FEE2E2', color: '#B91C1C' },
  recalculate_complete: { icon: 'zap', label: 'Score Recalculated', bg: '#ECFEFF', color: '#0E7490' },
  lead_assigned: { icon: 'user-check', label: 'Lead Assigned', bg: '#DBEAFE', color: '#1E40AF' },
  follow_up_overdue: { icon: 'clock', label: 'Follow-Up Overdue', bg: '#FEF2F2', color: '#DC2626' },
  school_deactivated: { icon: 'alert', label: 'School Deactivated', bg: '#FFF7ED', color: '#C2410C' },
  bulk_import_complete: { icon: 'download', label: 'Bulk Import Complete', bg: '#F0FDF4', color: '#15803D' },
  lead_reopened: { icon: 'refresh', label: 'Lead Reopened', bg: '#EEF2FF', color: '#4338CA' },
  lead_expiry_warning: { icon: 'clock', label: 'Expiry Warning', bg: '#FEF3C7', color: '#92400E' },
  lead_suspended: { icon: 'pause', label: 'Lead Suspended', bg: '#F1F5F9', color: '#334155' },
};

export default function Navbar({
  currentTab,
  onOpenNewLead,
  onSelectTab,
  onToggleMobileMenu,
  onToggleSidebar,
  sidebarCollapsed = false,
  onShowToast,
}: NavbarProps) {
  const { user, accessToken, previewRole, setPreviewRole, isAuthenticated } = useAuthStore();

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pendingLogCount, setPendingLogCount] = useState<number>(0);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [globalSearchText, setGlobalSearchText] = useState('');
  const [topDateRange, setTopDateRange] = useState('Last 30 Days');
  const [showWhatsAppBotModal, setShowWhatsAppBotModal] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const loadTopbarCounts = async () => {
    if (!isAuthenticated) return;
    try {
      const [cntRes, notifRes, queueRes] = await Promise.all([
        apiCall('/notifications/unread-count').catch(() => ({ count: 0 })),
        apiCall('/notifications?limit=12').catch(() => ({ notifications: [] })),
        apiCall('/pending-logging-queue').catch(() => ({ items: [] })),
      ]);
      const unread = cntRes?.count ?? cntRes?.unreadCount ?? cntRes?.data?.unreadCount ?? 0;
      setUnreadCount(Number(unread) || 0);
      const list = notifRes?.notifications || notifRes?.items || notifRes?.data?.notifications || [];
      setNotifications(Array.isArray(list) ? list : []);
      const qItems = queueRes?.items || queueRes?.queue || queueRes?.data?.items || [];
      setPendingLogCount(Array.isArray(qItems) ? qItems.length : 0);
    } catch {
      // Non-fatal background refresh error
    }
  };

  const refreshOfflineCount = async () => {
    const c = await getPendingMutationCount();
    setOfflineCount(c);
  };

  useEffect(() => {
    refreshOfflineCount();
    const handleOnline = () => {
      setIsOnline(true);
      flushPendingOfflineMutations().then((res) => {
        refreshOfflineCount();
        if (res.synced > 0 && onShowToast) {
          onShowToast(`Synced ${res.synced} offline mutation(s) cleanly.`, 'success');
        }
      });
    };
    const handleOffline = () => setIsOnline(false);
    const handleQueueEvt = () => refreshOfflineCount();
    const handleLogQueueEvt = () => loadTopbarCounts();
    const handleOpenWhatsAppBot = () => setShowWhatsAppBotModal(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('crm-offline-sync-updated', handleQueueEvt);
    window.addEventListener('crm-logging-queue-updated', handleLogQueueEvt);
    window.addEventListener('crm-open-whatsapp-bot', handleOpenWhatsAppBot);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('crm-offline-sync-updated', handleQueueEvt);
      window.removeEventListener('crm-logging-queue-updated', handleLogQueueEvt);
      window.removeEventListener('crm-open-whatsapp-bot', handleOpenWhatsAppBot);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    loadTopbarCounts();
    const poll = setInterval(loadTopbarCounts, 45000);

    let socket: Socket | null = null;
    try {
      const apiBase = getApiBase();
      const origin = apiBase.startsWith('http')
        ? apiBase.replace(/\/api$/, '')
        : window.location.origin;
      const token = accessToken || localStorage.getItem('crm_token') || '';
      socket = io(`${origin}/notifications`, {
        auth: { token },
        withCredentials: true,
        transports: ['websocket', 'polling'],
      });
      socket.on('connect', () => {
        socket?.emit('join_user', { userId: user.id, role: user.rawRole || user.role });
      });
      socket.on('notification', (payload: NotificationItem) => {
        setNotifications((prev) => {
          if (prev.some((x) => x.id === payload.id)) return prev;
          return [payload, ...prev.slice(0, 19)];
        });
        setUnreadCount((c) => c + 1);
        if (onShowToast && payload?.title) {
          onShowToast(`${payload.title}: ${payload.message}`, 'warning');
        }
      });
      socket.on('notification_read', (payload: { id?: string }) => {
        if (!payload?.id) return;
        setNotifications((prev) =>
          prev.map((x) => (x.id === payload.id ? { ...x, isRead: true } : x))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      });
      socket.on('notifications_all_read', () => {
        setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })));
        setUnreadCount(0);
      });
    } catch {
      // Graceful fallback to REST polling when WebSocket cannot connect
    }

    return () => {
      clearInterval(poll);
      if (socket) socket.disconnect();
    };
  }, [isAuthenticated, user?.id, accessToken]);

  // Presence heartbeat: ping every 30s while the tab is visible AND the user interacted in the last 5 min.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let lastInteraction = Date.now();
    const markActive = () => {
      lastInteraction = Date.now();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (Date.now() - lastInteraction > 5 * 60 * 1000) return;
      apiCall('/presence/heartbeat', 'POST', {}, { skipOfflineQueue: true }).catch(() => undefined);
    };
    beat();
    const timer = setInterval(beat, 30000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, markActive));
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

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
    return titles[view] || 'BoardingEdu CRM';
  };

  const handlePreviewChange = (val: string) => {
    if (!val) {
      setPreviewRole(null);
      if (onShowToast) onShowToast('Returned to Admin Control Dashboard', 'success');
    } else {
      setPreviewRole(val as any);
      const label = val === 'SENIOR_MANAGER' ? 'MANAGER' : 'COUNSELLOR';
      if (onShowToast) onShowToast(`Switched to ${label} Preview Mode`, 'success');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiCall('/notifications/mark-all-read', 'PUT', {});
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      try {
        await apiCall(`/notifications/${n.id}/read`, 'PUT', {});
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      } catch {
        // ignore
      }
    }
    setNotifOpen(false);
    if (n.type === 'report_ready' && n.link && n.link.includes('/reports/download/')) {
      const apiPath = n.link.replace(/^\/api/, '');
      try {
        await downloadApiFile(apiPath, `CRM_Report_${n.id.slice(0, 6)}.json`);
        onShowToast?.('Report download started!', 'success');
      } catch {
        onSelectTab('reports');
      }
      return;
    }
    const ent = (n.type || n.relatedEntityType || n.link || '').toLowerCase();
    if (ent.includes('report')) onSelectTab('reports');
    else if (ent.includes('school')) onSelectTab('schools');
    else if (ent.includes('follow')) onSelectTab('followups');
    else if (ent.includes('commission')) onSelectTab('commissions');
    else if (ent.includes('admission') || ent.includes('application')) onSelectTab('admissions');
    else if (ent.includes('lead') || ent.includes('merge') || ent.includes('recalculate') || ent.includes('bulk_import')) onSelectTab('leads');
  };

  const handleManualOfflineSync = async () => {
    setSyncingOffline(true);
    try {
      const res = await flushPendingOfflineMutations();
      await refreshOfflineCount();
      if (onShowToast) {
        onShowToast(
          res.synced > 0
            ? `Synced ${res.synced} queued action(s) to server.`
            : res.remaining > 0
            ? `${res.remaining} action(s) waiting for network.`
            : 'All offline records are up to date.',
          res.failed > 0 ? 'warning' : 'success'
        );
      }
    } finally {
      setSyncingOffline(false);
    }
  };

  return (
    <>
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
        {/* Mobile Brand Logo only (BoardingEdu text removed as requested) */}
        <div
          className="mobile-brand-header mobile-only"
          onClick={() => onSelectTab('dashboard')}
          title="BoardingEdu CRM"
        >
          <img
            src="/boardingedu-logo.png"
            alt="BoardingEdu"
            className="mobile-brand-logo"
          />
        </div>

        {/* Global Search Bar matching reference screenshot */}
        <form
          className="topbar-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            const q = globalSearchText.trim().toLowerCase();
            if (!q) return;
            if (q.includes('manager')) onSelectTab('managers');
            else if (q.includes('counsellor') || q.includes('staff')) onSelectTab('counsellors');
            else if (q.includes('school')) onSelectTab('schools');
            else if (q.includes('team')) onSelectTab('teams');
            else onSelectTab('leads');
            if (onShowToast) {
              onShowToast(`Searching CRM for "${globalSearchText.trim()}"...`, 'success');
            }
          }}
        >
          <span className="topbar-search-icon">
            <CrmIcon name="search" size={15} />
          </span>
          <input
            type="text"
            className="topbar-search-input"
            placeholder="Search managers, counsellors, leads..."
            value={globalSearchText}
            onChange={(e) => setGlobalSearchText(e.target.value)}
          />
        </form>
      </div>

      <div className="topbar-right">
        <div
          className="desktop-only"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#16A34A',
            padding: '4px 10px',
            borderRadius: '999px',
            background: '#DCFCE7',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#16A34A',
              display: 'inline-block',
            }}
          />
          System Online
        </div>

        <div
          className="desktop-only"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '4px 10px',
          }}
        >
          <CrmIcon name="calendar" size={14} color="#475569" />
          <select
            className="dashboard-select"
            value={topDateRange}
            onChange={(e) => setTopDateRange(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: '12px',
              fontWeight: 600,
              color: '#1E293B',
              outline: 'none',
            }}
          >
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="This Month">This Month</option>
            <option value="All Time">All Time</option>
          </select>
        </div>
        {(!isOnline || offlineCount > 0) && (
          <button
            className="btn btn-sm btn-outline desktop-only"
            onClick={handleManualOfflineSync}
            disabled={syncingOffline}
            title="Offline PWA Queue (Dexie.js)"
            style={{
              background: !isOnline ? '#FEF2F2' : '#EFF6FF',
              color: !isOnline ? '#B91C1C' : '#1D4ED8',
              borderColor: !isOnline ? '#FECACA' : '#BFDBFE',
            }}
          >
            {!isOnline ? (
              <>
                <CrmIcon name="wifi" size={14} /> Offline ({offlineCount})
              </>
            ) : syncingOffline ? (
              <>
                <CrmIcon name="clock" size={14} /> Syncing...
              </>
            ) : (
              <>
                <CrmIcon name="refresh" size={14} /> Sync ({offlineCount})
              </>
            )}
          </button>
        )}

        {pendingLogCount > 0 && (
          <button
            className="btn btn-sm btn-warning desktop-only"
            onClick={() => {
              onSelectTab('dashboard');
              if (onShowToast) {
                onShowToast(
                  `${pendingLogCount} call/WhatsApp outcome(s) pending resolution.`,
                  'warning'
                );
              }
            }}
            title="Layer-3 Activity Logging Lock Queue"
          >
            <CrmIcon name="clock" size={14} /> {pendingLogCount} Unlogged
          </button>
        )}

        {/* Admin Dashboard Switcher Preview Feature */}
        {hasRole(user?.role, 'SUPER_ADMIN') && (
          <div className="dashboard-switcher desktop-only">
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

        {/* Mobile Hamburger Menu Button - positioned right before notification bell to match Image 4 */}
        <button
          className="mobile-menu-btn mobile-only"
          onClick={onToggleMobileMenu}
          aria-label="Open navigation menu"
          title="Menu"
        >
          <CrmIcon name="menu" size={20} />
        </button>

        <div ref={notifRef} className="topbar-notif-container">
          <button
            className="topbar-btn topbar-notif-btn"
            onClick={() => {
              setNotifOpen((o) => !o);
              loadTopbarCounts();
            }}
            aria-label="Notifications"
            title="Real-time CRM Notifications"
          >
            <CrmIcon name="bell" size={20} color="#1E3A8A" />
            {unreadCount > 0 && (
              <span className="topbar-badge">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              style={{
                position: 'fixed',
                right: '12px',
                top: '58px',
                width: '360px',
                maxWidth: 'calc(100vw - 24px)',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '12px',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
                zIndex: 1400,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: '#123B70',
                  color: '#FFFFFF',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                <span>Live Notifications ({unreadCount} unread)</span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    style={{
                      background: 'rgba(255,255,255,0.16)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontSize: '12.5px' }}>
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((n) => {
                    const meta = NOTIFICATION_EVENT_META[n.type] || {
                      icon: 'bell',
                      label: String(n.type || 'Alert').replace(/_/g, ' '),
                      bg: '#F1F5F9',
                      color: '#334155',
                    };
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid #F1F5F9',
                          background: n.isRead ? '#FFFFFF' : '#EFF6FF',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: meta.bg,
                              color: meta.color,
                              padding: '2px 7px',
                              borderRadius: '999px',
                              fontSize: '10px',
                              fontWeight: 700,
                            }}
                          >
                            <CrmIcon name={meta.icon} size={11} />
                            <span>{meta.label}</span>
                          </span>
                          {!n.isRead && (
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
                          )}
                        </div>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                          {n.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', lineHeight: 1.4 }}>
                          {n.message}
                        </div>
                        {n.type === 'report_ready' && n.link && (
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#047857', marginTop: '5px' }}>
                            ⬇ Click to Download Report
                          </div>
                        )}
                        <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>
                          {n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN') : 'Just now'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <button className="btn btn-primary btn-sm desktop-only" onClick={onOpenNewLead}>
          <CrmIcon name="plus" size={15} /> <span className="hidden sm:inline">New </span>Lead
        </button>

        {/* User Avatar Pill matching reference screenshot */}
        <div
          className="desktop-only"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px 4px 4px',
            borderRadius: '999px',
            border: '1px solid #E2E8F0',
            background: '#F8FAFC',
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          onClick={() => onSelectTab('settings')}
          title="Account Profile & Settings"
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#2563EB',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            SA
          </div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#0F172A',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            {hasRole(user?.role, 'SUPER_ADMIN') ? 'Super Admin' : user?.fullName || 'User'}
            <CrmIcon name="chevron-down" size={12} />
          </span>
        </div>
      </div>
      </header>

      {previewRole && (
        <div className="preview-badge-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#D97706',
                color: '#FFFFFF',
                fontSize: '10.5px',
                fontWeight: 800,
                padding: '3px 9px',
                borderRadius: '999px',
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              <CrmIcon name="eye" size={12} color="#FFFFFF" /> Preview Mode
            </span>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#78350F', lineHeight: 1.35 }}>
              Viewing interface as{' '}
              <strong style={{ color: '#92400E', fontWeight: 800 }}>
                {previewRole === 'SENIOR_MANAGER' ? 'Manager' : 'Counsellor'}
              </strong>{' '}
              <span style={{ color: '#B45309', fontWeight: 500 }}>(Admin permissions intact)</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => handlePreviewChange('')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: '#FFFFFF',
              color: '#92400E',
              border: '1px solid #F59E0B',
              borderRadius: '8px',
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(146, 64, 14, 0.1)',
              flexShrink: 0,
            }}
          >
            <CrmIcon name="x" size={13} color="#92400E" />
            Exit Preview
          </button>
        </div>
      )}

      <WhatsAppBotModal
        isOpen={showWhatsAppBotModal}
        onClose={() => setShowWhatsAppBotModal(false)}
        onShowToast={onShowToast}
      />
    </>
  );
}
