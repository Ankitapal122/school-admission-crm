import React, { useState, useEffect } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall, downloadApiFile } from '../../lib/api';

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVERSE' | 'AUTO';
  module: string;
  details: string;
  flag?: string;
  isSpecial?: boolean;
}

const DEFAULT_AUDIT_LOGS: AuditEntry[] = [
  {
    id: 'aud-1',
    timestamp: '14 Oct 10:45',
    user: 'Rahul S.',
    action: 'CREATE',
    module: 'Leads',
    details: 'Created LD000123 (Aryan Kumar)',
    flag: '—',
  },
  {
    id: 'aud-2',
    timestamp: '14 Oct 11:20',
    user: 'RM',
    action: 'UPDATE',
    module: 'Leads',
    details: 'LD000123 status: new → contacted',
    flag: '—',
  },
  {
    id: 'aud-3',
    timestamp: '13 Oct 15:30',
    user: 'Priya C.',
    action: 'DELETE',
    module: 'Leads',
    details: 'LD000115 soft deleted',
    flag: '—',
  },
  {
    id: 'aud-4',
    timestamp: '02 Nov 16:00',
    user: 'Admin',
    action: 'REVERSE',
    module: 'Commission',
    details: 'CM004 reversed – "Admission cancelled"',
    flag: 'Special',
    isSpecial: true,
  },
  {
    id: 'aud-5',
    timestamp: '01 Nov 09:00',
    user: 'System',
    action: 'AUTO',
    module: 'Leads',
    details: 'LD000045 force expired (360 days)',
    flag: '—',
  },
];

export default function AuditLogViewer({
  onShowToast,
}: {
  onShowToast?: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [logs, setLogs] = useState<AuditEntry[]>(DEFAULT_AUDIT_LOGS);
  const [selectedUser, setSelectedUser] = useState('All');
  const [selectedModule, setSelectedModule] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('Oct 2025');

  useEffect(() => {
    apiCall('/audit-log?limit=50')
      .then((res) => {
        const liveItems = res?.logs || res?.auditLogs || res?.data || [];
        if (Array.isArray(liveItems) && liveItems.length > 0) {
          const formatted: AuditEntry[] = liveItems.map((item: any, idx: number) => {
            const rawAct = String(item.action || 'UPDATE').toUpperCase();
            const action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVERSE' | 'AUTO' =
              rawAct.includes('CREATE')
                ? 'CREATE'
                : rawAct.includes('DELETE')
                ? 'DELETE'
                : rawAct.includes('REVERSE')
                ? 'REVERSE'
                : rawAct.includes('AUTO') || rawAct.includes('EXPIR')
                ? 'AUTO'
                : 'UPDATE';

            const isReversal = action === 'REVERSE' || String(item.module || '').toLowerCase().includes('commission');
            const d = item.createdAt ? new Date(item.createdAt) : new Date();
            const timeStr = `${d.getDate().toString().padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

            return {
              id: item.id || `live-${idx}`,
              timestamp: timeStr,
              user: item.userName || item.user?.fullName || item.userId || 'Admin',
              action,
              module: item.module || (isReversal ? 'Commission' : 'Leads'),
              details: item.details || item.content || item.description || 'System state modified',
              flag: isReversal ? 'Special' : '—',
              isSpecial: isReversal,
            };
          });

          setLogs([...DEFAULT_AUDIT_LOGS, ...formatted]);
        }
      })
      .catch(() => {});
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (selectedUser !== 'All' && !log.user.toLowerCase().includes(selectedUser.toLowerCase())) {
      return false;
    }
    if (selectedModule !== 'All' && log.module.toLowerCase() !== selectedModule.toLowerCase()) {
      return false;
    }
    return true;
  });

  const handleApplyFilter = () => {
    if (onShowToast) onShowToast(`Filtered by Module: ${selectedModule}, User: ${selectedUser}`, 'success');
  };

  const handleExport = () => {
    downloadApiFile('/reports/audit?format=csv', 'Audit_Log_Master.csv');
    if (onShowToast) onShowToast('Exporting Audit Log trail to CSV...', 'success');
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return (
          <span style={{ backgroundColor: '#2563EB', color: '#FFFFFF', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
            CREATE
          </span>
        );
      case 'UPDATE':
        return (
          <span style={{ backgroundColor: '#EA580C', color: '#FFFFFF', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
            UPDATE
          </span>
        );
      case 'DELETE':
        return (
          <span style={{ backgroundColor: '#DC2626', color: '#FFFFFF', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
            DELETE
          </span>
        );
      case 'REVERSE':
        return (
          <span style={{ backgroundColor: '#E11D48', color: '#FFFFFF', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
            REVERSE
          </span>
        );
      case 'AUTO':
        return (
          <span style={{ backgroundColor: '#7C3AED', color: '#FFFFFF', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
            AUTO
          </span>
        );
      default:
        return (
          <span style={{ backgroundColor: '#64748B', color: '#FFFFFF', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
            {action}
          </span>
        );
    }
  };

  return (
    <div style={{ padding: '20px 24px', backgroundColor: '#F8FAFC', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* 31. Header Bar */}
      <div
        style={{
          backgroundColor: '#1E3A8A',
          backgroundImage: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
          borderRadius: '12px 12px 0 0',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#FFFFFF',
          boxShadow: '0 4px 12px rgba(30, 58, 138, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#3B82F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '14px',
              color: '#FFFFFF',
            }}
          >
            31
          </div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>
            Audit Log Viewer
          </h2>
        </div>
        <span
          style={{
            backgroundColor: '#F59E0B',
            color: '#78350F',
            fontSize: '11.5px',
            fontWeight: 800,
            padding: '4px 12px',
            borderRadius: '20px',
            letterSpacing: '0.5px',
          }}
        >
          SUPER ADMIN
        </span>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '0 0 12px 12px',
          padding: '20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          border: '1px solid #E2E8F0',
          borderTop: 'none',
        }}
      >
        {/* Purpose Banner */}
        <div
          style={{
            backgroundColor: '#FFFBEB',
            borderLeft: '4px solid #F59E0B',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '18px',
            fontSize: '12.5px',
            color: '#92400E',
            lineHeight: 1.5,
          }}
        >
          <strong>Purpose:</strong> Complete audit trail – who, when, and what changed. Month-partitioned. Commission reversals carry a special flag.
        </div>

        {/* Filter Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '18px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>User:</span>
            <select
              className="form-control"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', minWidth: '120px' }}
            >
              <option value="All">All Users ▾</option>
              <option value="Rahul S.">Rahul S.</option>
              <option value="RM">RM</option>
              <option value="Priya C.">Priya C.</option>
              <option value="Admin">Admin</option>
              <option value="System">System</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Module:</span>
            <select
              className="form-control"
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', minWidth: '130px' }}
            >
              <option value="All">All Modules ▾</option>
              <option value="Leads">Leads</option>
              <option value="Commission">Commission</option>
              <option value="Schools">Schools</option>
              <option value="Users">Users</option>
              <option value="Security">Security</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Date:</span>
            <select
              className="form-control"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', minWidth: '130px' }}
            >
              <option value="Oct 2025">Oct 2025 ▾</option>
              <option value="Nov 2025">Nov 2025</option>
              <option value="Dec 2025">Dec 2025</option>
              <option value="Nov 2026">Nov 2026 (Live)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleApplyFilter}
            style={{
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🔍 Filter</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📥 Export</span>
          </button>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>TIMESTAMP</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>USER</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>ACTION</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>MODULE</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>DETAILS</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>FLAG</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const isSpecial = log.isSpecial || log.action === 'REVERSE';
                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: isSpecial ? '#FEE2E2' : '#FFFFFF',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {log.timestamp}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>
                      {log.user}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {getActionBadge(log.action)}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 600 }}>
                      {log.module}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#1E293B', fontWeight: 500 }}>
                      {log.details}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      {isSpecial ? (
                        <span style={{ color: '#DC2626', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🚩 Special
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Retention Note Banner */}
        <div
          style={{
            marginTop: '18px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderLeft: '4px solid #2563EB',
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: '11.5px',
            color: '#1E293B',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>📌</span>
          <span>
            <strong>Retention:</strong> 90 days queryable online, then archived to S3 for 12 months. Auto-delete after 15 months total.
          </span>
        </div>

        {/* API Notes Footer */}
        <div
          style={{
            marginTop: '16px',
            backgroundColor: '#0F172A',
            color: '#94A3B8',
            borderRadius: '8px',
            padding: '10px 16px',
            fontFamily: 'monospace',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ backgroundColor: '#10B981', color: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
            GET
          </span>
          <span style={{ color: '#38BDF8' }}>/audit-log</span>
          <span style={{ color: '#64748B' }}>|</span>
          <span style={{ backgroundColor: '#10B981', color: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
            GET
          </span>
          <span style={{ color: '#38BDF8' }}>/audit-log/:module</span>
        </div>
      </div>
    </div>
  );
}
