import React, { useState, useEffect, useMemo } from 'react';
import { apiCall, downloadApiFile } from '../../lib/api';
import CrmIcon from '../../components/CrmIcon';

interface AuditEntry {
  id: string;
  timestamp: string;
  rawDate: string;
  user: string;
  role: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVERSE' | 'AUTO' | 'LOGIN' | 'LOGOUT';
  module: string;
  entity: string;
  details: string;
  flag?: string;
  isSpecial?: boolean;
}

function formatJsonValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    return val.map(formatJsonValue).filter(Boolean).join(', ');
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .slice(0, 8)
      .map(([k, v]) => {
        const prettyKey = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
        const prettyVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `${prettyKey}: ${prettyVal}`;
      });
    return entries.join(' • ');
  }
  return String(val);
}

function buildAuditDetails(item: any): string {
  const parts: string[] = [];
  if (item.entity && item.entityId) {
    parts.push(`${String(item.entity)} (${String(item.entityId).slice(0, 10)})`);
  } else if (item.entity) {
    parts.push(String(item.entity));
  }

  const detailStr =
    formatJsonValue(item.details) ||
    formatJsonValue(item.content) ||
    formatJsonValue(item.description) ||
    formatJsonValue(item.newValue) ||
    formatJsonValue(item.oldValue);

  if (detailStr) parts.push(detailStr);
  return parts.join(' — ') || 'System state updated';
}

export default function AuditLogViewer({
  onShowToast,
}: {
  onShowToast?: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedUser, setSelectedUser] = useState('All');
  const [selectedModule, setSelectedModule] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await apiCall('/audit-log?limit=150');
      const liveItems = Array.isArray(res?.logs)
        ? res.logs
        : Array.isArray(res?.auditLogs)
        ? res.auditLogs
        : Array.isArray(res?.data?.logs)
        ? res.data.logs
        : Array.isArray(res?.data)
        ? res.data
        : [];

      const formatted: AuditEntry[] = liveItems.map((item: any, idx: number) => {
        const rawAct = String(item?.action || 'UPDATE').toUpperCase();
        const action: AuditEntry['action'] =
          rawAct.includes('LOGIN')
            ? 'LOGIN'
            : rawAct.includes('LOGOUT')
            ? 'LOGOUT'
            : rawAct.includes('CREATE')
            ? 'CREATE'
            : rawAct.includes('DELETE')
            ? 'DELETE'
            : rawAct.includes('REVERSE')
            ? 'REVERSE'
            : rawAct.includes('AUTO') || rawAct.includes('EXPIR')
            ? 'AUTO'
            : 'UPDATE';

        const mod = String(item?.module || 'system');
        const isSpecial =
          Boolean(item?.isSpecialFlag) ||
          action === 'REVERSE' ||
          action === 'DELETE' ||
          mod.toLowerCase().includes('commission');

        const d = item?.createdAt ? new Date(item.createdAt) : new Date();
        const validDate = !isNaN(d.getTime()) ? d : new Date();
        const timeStr = validDate.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        const userLabel =
          typeof item?.userName === 'string' && item.userName.trim()
            ? item.userName
            : typeof item?.user?.fullName === 'string' && item.user.fullName.trim()
            ? item.user.fullName
            : item?.userId
            ? String(item.userId).slice(0, 8)
            : 'System';

        return {
          id: String(item?.id || `live-${idx}`),
          timestamp: timeStr,
          rawDate: validDate.toISOString(),
          user: userLabel,
          role: String(item?.userRole || item?.user?.role || ''),
          action,
          module: mod,
          entity: String(item?.entity || ''),
          details: buildAuditDetails(item),
          flag: isSpecial ? 'Special' : '—',
          isSpecial,
        };
      });

      setLogs(formatted);
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(err?.message || 'Could not load audit logs.', 'warning');
      }
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const uniqueUsers = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.user).filter(Boolean))).sort();
  }, [logs]);

  const uniqueModules = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.module).filter(Boolean))).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedUser !== 'All' && log.user !== selectedUser) return false;
      if (selectedModule !== 'All' && log.module.toLowerCase() !== selectedModule.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${log.user} ${log.action} ${log.module} ${log.details} ${log.timestamp}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, selectedUser, selectedModule, searchQuery]);

  const handleExport = () => {
    downloadApiFile('/reports/audit?format=csv', 'Audit_Log_Master.csv').catch(() => {
      // Fallback client CSV export if endpoint unavailable
      const headers = ['Timestamp', 'User', 'Role', 'Action', 'Module', 'Details', 'Flag'];
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        headers.join(','),
        ...filteredLogs.map((l) => [l.timestamp, l.user, l.role, l.action, l.module, l.details, l.flag].map(esc).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    if (onShowToast) onShowToast('Exporting Audit Log trail to CSV...', 'success');
  };

  const getActionBadge = (action: string) => {
    const colorMap: Record<string, string> = {
      CREATE: '#2563EB',
      UPDATE: '#EA580C',
      DELETE: '#DC2626',
      REVERSE: '#E11D48',
      AUTO: '#7C3AED',
      LOGIN: '#16A34A',
      LOGOUT: '#475569',
    };
    const bg = colorMap[action] || '#64748B';
    return (
      <span
        style={{
          backgroundColor: bg,
          color: '#FFFFFF',
          padding: '3px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        {action}
      </span>
    );
  };

  const formatHumanValue = (v: string) => {
    const map: Record<string, string> = {
      A_waiting: 'A • Waiting',
      B_only_registration: 'B • Registration Only',
      C_formalities_done: 'C • Confirmed',
      true: 'Yes',
      false: 'No',
    };
    if (map[v]) return map[v];
    return v.replace(/_/g, ' ');
  };

  const formatHumanKey = (k: string) => {
    const map: Record<string, string> = {
      'app Code': 'App Ref',
      appCode: 'App Ref',
      'new Sub Stage': 'New Stage',
      newSubStage: 'New Stage',
      'old Sub Stage': 'Previous Stage',
      oldSubStage: 'Previous Stage',
      'commissions Generated': 'Commission',
      commissionsGenerated: 'Commission',
    };
    return map[k] || k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const renderStructuredDetails = (details: string) => {
    const raw = String(details || '').trim();
    if (!raw) return <span style={{ color: '#94A3B8' }}>—</span>;
    const [headPart, ...restParts] = raw.split('—').map((s) => s.trim());
    const segments = (restParts.length > 0 ? restParts.join(' — ') : headPart)
      .split('•')
      .map((s) => s.trim())
      .filter(Boolean);

    if (restParts.length === 0 && segments.length <= 1) {
      return <span style={{ color: '#1E293B', lineHeight: 1.45 }}>{raw}</span>;
    }

    // Extract structured key-values to detect clean stage transitions (e.g. Old -> New)
    const pairs: Array<{ key: string; val: string }> = [];
    const plainNotes: string[] = [];
    for (const seg of segments) {
      const colonIdx = seg.indexOf(':');
      if (colonIdx > 0 && colonIdx < 32) {
        pairs.push({ key: seg.slice(0, colonIdx).trim(), val: seg.slice(colonIdx + 1).trim() });
      } else {
        plainNotes.push(seg);
      }
    }

    const appRefPair = pairs.find((p) => p.key === 'app Code' || p.key === 'appCode');
    const oldStagePair = pairs.find((p) => p.key === 'old Sub Stage' || p.key === 'oldSubStage');
    const newStagePair = pairs.find((p) => p.key === 'new Sub Stage' || p.key === 'newSubStage');
    const commPair = pairs.find((p) => p.key === 'commissions Generated' || p.key === 'commissionsGenerated');
    const otherPairs = pairs.filter(
      (p) => p !== appRefPair && p !== oldStagePair && p !== newStagePair && p !== commPair
    );

    const displayTitle = appRefPair
      ? `Application ${appRefPair.val}`
      : restParts.length > 0 && headPart
      ? headPart
      : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {displayTitle && (
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '12.5px' }}>{displayTitle}</div>
        )}

        {(oldStagePair || newStagePair) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11.5px' }}>
            {oldStagePair && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  fontWeight: 600,
                }}
              >
                {formatHumanValue(oldStagePair.val)}
              </span>
            )}
            {oldStagePair && newStagePair && <span style={{ color: '#94A3B8', fontWeight: 700 }}>→</span>}
            {newStagePair && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: newStagePair.val === 'C_formalities_done' ? '#ECFDF5' : '#EFF6FF',
                  border: `1px solid ${newStagePair.val === 'C_formalities_done' ? '#A7F3D0' : '#BFDBFE'}`,
                  color: newStagePair.val === 'C_formalities_done' ? '#047857' : '#1D4ED8',
                  fontWeight: 700,
                }}
              >
                {formatHumanValue(newStagePair.val)}
              </span>
            )}
            {commPair && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: commPair.val === 'true' ? '#ECFDF5' : '#F8FAFC',
                  border: `1px solid ${commPair.val === 'true' ? '#A7F3D0' : '#E2E8F0'}`,
                  color: commPair.val === 'true' ? '#047857' : '#64748B',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                {commPair.val === 'true' ? 'Commission Generated ✓' : 'No Commission'}
              </span>
            )}
          </div>
        )}

        {(otherPairs.length > 0 || plainNotes.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {otherPairs.map((p, idx) => (
              <span
                key={`p-${idx}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  fontSize: '11px',
                  lineHeight: 1.4,
                  maxWidth: '100%',
                  wordBreak: 'break-word',
                }}
              >
                <span style={{ color: '#64748B', fontWeight: 600 }}>{formatHumanKey(p.key)}:</span>
                <span style={{ color: '#0F172A', fontWeight: 700 }}>{formatHumanValue(p.val)}</span>
              </span>
            ))}
            {plainNotes.map((seg, idx) => (
              <span
                key={`n-${idx}`}
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '11px',
                  color: '#334155',
                  fontWeight: 600,
                }}
              >
                {seg}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '4px 0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header Bar */}
      <div
        style={{
          backgroundColor: '#1E3A8A',
          backgroundImage: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
          borderRadius: '12px 12px 0 0',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          color: '#FFFFFF',
          boxShadow: '0 4px 12px rgba(30, 58, 138, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
            }}
          >
            <CrmIcon name="shield" size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>
              Audit Log Viewer ({filteredLogs.length} Real Events)
            </h2>
            <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>
              Immutable security &amp; operational activity log across all CRM modules
            </div>
          </div>
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
          <input
            type="text"
            className="form-control"
            placeholder="Search user, action, student, UTR..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '6px', minWidth: '200px', flex: '1 1 220px' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>User:</span>
            <select
              className="form-control"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', minWidth: '130px' }}
            >
              <option value="All">All Users ({uniqueUsers.length})</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
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
              <option value="All">All Modules ({uniqueModules.length})</option>
              {uniqueModules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={loadAuditLogs}
            className="btn btn-sm btn-primary"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh Live'}
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="btn btn-sm btn-outline"
          >
            Export CSV
          </button>
        </div>

        {/* Mobile Card View (Professional Responsive Details Layout) */}
        <div className="flex flex-col gap-2.5 md:hidden">
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
              Loading real audit trail...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
              No audit log entries recorded for this filter yet.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isSpecial = log.isSpecial || log.action === 'REVERSE';
              return (
                <div
                  key={`mob-${log.id}`}
                  style={{
                    border: `1px solid ${isSpecial ? '#FECACA' : '#E2E8F0'}`,
                    backgroundColor: isSpecial ? '#FEF2F2' : '#FFFFFF',
                    borderRadius: '10px',
                    padding: '12px',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {getActionBadge(log.action)}
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#EFF6FF',
                          color: '#1D4ED8',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                        }}
                      >
                        {log.module}
                      </span>
                      {isSpecial && (
                        <span style={{ color: '#DC2626', fontSize: '11px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <CrmIcon name="alert" size={12} /> Special
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                      {log.timestamp}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{log.user}</span>
                    {log.role && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#475569',
                          backgroundColor: '#F1F5F9',
                          padding: '1px 6px',
                          borderRadius: '999px',
                        }}
                      >
                        {log.role}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', marginBottom: '4px' }}>
                      DETAILS
                    </div>
                    {renderStructuredDetails(log.details)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Data Table */}
        <div className="hidden md:block" style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
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
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#64748B' }}>
                    Loading real audit trail...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#64748B' }}>
                    No audit log entries recorded for this filter yet.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSpecial = log.isSpecial || log.action === 'REVERSE';
                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: isSpecial ? '#FEF2F2' : '#FFFFFF',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '12px 14px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {log.timestamp}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        <div>{log.user}</div>
                        {log.role && (
                          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>{log.role}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {getActionBadge(log.action)}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 700, textTransform: 'capitalize' }}>
                        {log.module}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#1E293B', fontWeight: 500, maxWidth: '460px', wordBreak: 'break-word' }}>
                        {renderStructuredDetails(log.details)}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {isSpecial ? (
                          <span style={{ color: '#DC2626', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CrmIcon name="alert" size={14} /> Special
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
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
          <CrmIcon name="shield" size={15} color="#2563EB" />
          <span>
            <strong>Retention:</strong> 90 days queryable online, then archived for 12 months. Full login/logout, fee payment, and commission reversal history preserved.
          </span>
        </div>
      </div>
    </div>
  );
}
