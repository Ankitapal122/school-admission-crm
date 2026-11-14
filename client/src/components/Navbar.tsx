import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { apiCall, flushPendingOfflineMutations, getApiBase } from '../lib/api';
import { getPendingMutationCount } from '../lib/offlineDb';
import { hasRole } from '../lib/roles';

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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('crm-offline-sync-updated', handleQueueEvt);
    window.addEventListener('crm-logging-queue-updated', handleLogQueueEvt);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('crm-offline-sync-updated', handleQueueEvt);
      window.removeEventListener('crm-logging-queue-updated', handleLogQueueEvt);
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
        setNotifications((prev) => [payload, ...prev.slice(0, 14)]);
        setUnreadCount((c) => c + 1);
        if (onShowToast && payload?.title) {
          onShowToast(`${payload.title}: ${payload.message}`, 'warning');
        }
      });
    } catch {
      // Graceful fallback to REST polling when WebSocket cannot connect
    }

    return () => {
      clearInterval(poll);
      if (socket) socket.disconnect();
    };
  }, [isAuthenticated, user?.id, accessToken]);

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
    const ent = (n.relatedEntityType || n.link || '').toLowerCase();
    if (ent.includes('lead')) onSelectTab('leads');
    else if (ent.includes('commission')) onSelectTab('commissions');
    else if (ent.includes('admission') || ent.includes('application')) onSelectTab('admissions');
    else if (ent.includes('follow')) onSelectTab('followups');
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
        {(!isOnline || offlineCount > 0) && (
          <button
            className="btn btn-sm btn-outline"
            onClick={handleManualOfflineSync}
            disabled={syncingOffline}
            title="Offline PWA Queue (Dexie.js)"
            style={{
              background: !isOnline ? '#FEF2F2' : '#EFF6FF',
              color: !isOnline ? '#B91C1C' : '#1D4ED8',
              borderColor: !isOnline ? '#FECACA' : '#BFDBFE',
            }}
          >
            {!isOnline
              ? `📡 Offline (${offlineCount})`
              : syncingOffline
              ? '⏳ Syncing...'
              : `🔄 Sync (${offlineCount})`}
          </button>
        )}

        {pendingLogCount > 0 && (
          <button
            className="btn btn-sm btn-warning"
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
            ⏳ {pendingLogCount} Unlogged
          </button>
        )}

        {/* Admin Dashboard Switcher Preview Feature */}
        {hasRole(user?.role, 'SUPER_ADMIN') && (
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

        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="topbar-btn"
            onClick={() => {
              setNotifOpen((o) => !o);
              loadTopbarCounts();
            }}
            aria-label="Notifications"
            title="Real-time CRM Notifications"
          >
            <span>🔔</span>
            {unreadCount > 0 && <span className="dot" title={`${unreadCount} unread`} />}
          </button>

          {notifOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '46px',
                width: '340px',
                maxWidth: '90vw',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '12px',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
                zIndex: 1200,
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
                  notifications.map((n) => (
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
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>
                        {n.createdAt ? new Date(n.createdAt).toLocaleString() : 'Just now'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
