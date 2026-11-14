import React, { useEffect, useState } from 'react';
import { apiCall, downloadApiFile } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { hasRole } from '../../lib/roles';
import { BulkImportModal } from './FinanceAndSchoolsView';

const ALL_20_REPORTS = [
  { slug: 'leads', label: '1. Leads Master Report' },
  { slug: 'pipeline', label: '2. Stage Pipeline Conversion' },
  { slug: 'admissions', label: '3. Confirmed Admissions Report' },
  { slug: 'school-wise', label: '4. School-wise Applications & Revenue' },
  { slug: 'commission', label: '5. Commission Ledger Report' },
  { slug: 'revenue', label: '6. Organization Revenue & Projections' },
  { slug: 'performance/jr', label: '7. Jr. Counsellor Performance' },
  { slug: 'performance/sr', label: '8. Sr. Manager Team Performance' },
  { slug: 'login-logout', label: '9. Employee Login / Logout Activity' },
  { slug: 'audit', label: '10. Security & Audit Log Report' },
  { slug: 'follow-ups', label: '11. Follow-up SLA Compliance' },
  { slug: 'duplicates', label: '12. Duplicate & Merge Report' },
  { slug: 'source-conversion', label: '13. Lead Source ROI Conversion' },
  { slug: 'counsellor-funnel', label: '14. Counsellor Funnel Velocity' },
  { slug: 'time-to-conversion', label: '15. Time-to-Conversion Analytics' },
  { slug: 'lost-lead-analysis', label: '16. Lost / Expired / Disqualified Analysis' },
  { slug: 'school-revenue', label: '17. Partner School Revenue Contribution' },
  { slug: 'whatsapp-activity', label: '18. WhatsApp Activity & Delivery Log' },
  { slug: 'call-activity', label: '19. Parent Call Outcome Analytics' },
  { slug: 'commission-reversal', label: '20. Commission Reversal & FNF Ledger' },
];

export function ReportsView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const [selectedSlug, setSelectedSlug] = useState('leads');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [reportMeta, setReportMeta] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Async BullMQ Report Jobs
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);
  const [asyncJobState, setAsyncJobState] = useState<string>('');

  // S3 Cold Retention & Data Integrity Panel
  const [retentionResult, setRetentionResult] = useState<any>(null);
  const [integrityResult, setIntegrityResult] = useState<any>(null);

  const buildQuery = (extra = '') => {
    const p = new URLSearchParams();
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    if (extra) {
      const [k, v] = extra.split('=');
      p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `?${qs}` : '';
  };

  const handleRunReport = async () => {
    setLoadingReport(true);
    try {
      const res = await apiCall(`/reports/${selectedSlug}${buildQuery()}`);
      const payload = res?.data || res;
      const rows = Array.isArray(payload)
        ? payload
        : payload?.rows || payload?.items || payload?.records || payload?.leads || [];
      setReportRows(Array.isArray(rows) ? rows : [payload]);
      setReportMeta(payload);
      onShowToast(`Loaded ${selectedSlug} report cleanly.`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Report fetch failed.', 'danger');
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    handleRunReport();
  }, [selectedSlug]);

  const handleDownload = async (format: 'excel' | 'pdf') => {
    try {
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      const safeName = selectedSlug.replace(/\//g, '_');
      await downloadApiFile(
        `/reports/${selectedSlug}${buildQuery(`format=${format}`)}`,
        `BoardingEdu_${safeName}.${ext}`
      );
      onShowToast(`Downloaded ${format.toUpperCase()} export cleanly.`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || `Failed ${format} export.`, 'danger');
    }
  };

  const handleTriggerAsyncReport = async () => {
    try {
      const res = await apiCall(`/reports/${selectedSlug}${buildQuery('async=true')}`);
      const jobId = res?.jobId || res?.data?.jobId;
      if (jobId) {
        setAsyncJobId(jobId);
        setAsyncJobState('queued');
        onShowToast(`Async report job ${jobId} queued in BullMQ!`, 'success');
        const poll = setInterval(async () => {
          const st = await apiCall(`/jobs/${jobId}/status`).catch(() => null);
          const state = st?.job?.state || st?.state || 'completed';
          setAsyncJobState(state);
          if (state === 'completed' || state === 'failed') {
            clearInterval(poll);
          }
        }, 1500);
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Async report failed.', 'danger');
    }
  };

  const handleRunRetention = async () => {
    try {
      const res = await apiCall('/audit/retention-check', 'POST', {});
      setRetentionResult(res?.data || res);
      onShowToast('90-day S3 .json.gz retention check executed!', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Retention check failed.', 'danger');
    }
  };

  const handleRunIntegrity = async () => {
    try {
      const res = await apiCall('/data-integrity/check');
      setIntegrityResult(res?.data || res);
      onShowToast('Database & Referential Integrity Check completed.', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Integrity check failed.', 'danger');
    }
  };

  const columns =
    reportRows.length > 0 && typeof reportRows[0] === 'object' && reportRows[0] !== null
      ? Object.keys(reportRows[0]).slice(0, 7)
      : ['summary'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 className="card-title">📈 Enterprise Analytics &amp; 20-Report Export Suite</h3>
            <span className="card-subtitle">
              Real-time PostgreSQL aggregations with JSON preview, authenticated Excel/PDF downloads &amp; BullMQ async jobs
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" onClick={handleRunReport} disabled={loadingReport}>
              🔄 {loadingReport ? 'Loading...' : 'Refresh'}
            </button>
            <button className="btn btn-sm btn-success" onClick={() => handleDownload('excel')}>
              📊 Export Excel
            </button>
            <button className="btn btn-sm btn-navy" onClick={() => handleDownload('pdf')}>
              📄 Export PDF
            </button>
            <button className="btn btn-sm btn-outline" onClick={handleTriggerAsyncReport}>
              ⚙️ Async BullMQ Export
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label className="form-label">Select Blueprint Report (1–20)</label>
            <select
              className="form-control"
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
            >
              {ALL_20_REPORTS.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Date From</label>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Date To</label>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {asyncJobId && (
          <div
            style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              padding: '10px 12px',
              borderRadius: '8px',
              marginBottom: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12.5px',
            }}
          >
            <span>
              Async Export Job <strong>{asyncJobId}</strong> &mdash; State:{' '}
              <strong>{asyncJobState}</strong>
            </span>
            {asyncJobState === 'completed' && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() =>
                  downloadApiFile(
                    `/reports/download/${asyncJobId}`,
                    `Async_Report_${asyncJobId}.json`
                  )
                }
              >
                ⬇️ Download Output
              </button>
            )}
          </div>
        )}

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ textAlign: 'center', padding: '20px', color: '#64748B' }}>
                    {reportMeta?.message || 'No matching rows returned for the selected filters.'}
                  </td>
                </tr>
              ) : (
                reportRows.slice(0, 50).map((row: any, idx: number) => (
                  <tr key={row.id || idx}>
                    {columns.map((c) => {
                      const val = row?.[c];
                      return (
                        <td key={c}>
                          {val === null || val === undefined
                            ? '-'
                            : typeof val === 'object'
                            ? JSON.stringify(val).slice(0, 80)
                            : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Super Admin Governance: S3 Cold Archive & Referential Integrity */}
      {hasRole(user?.role, 'SUPER_ADMIN') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">🗄️ 90-Day S3 (.json.gz) Retention Archive</h3>
              <button className="btn btn-sm btn-warning" onClick={handleRunRetention}>
                Run Retention Check
              </button>
            </div>
            <p style={{ fontSize: '12.5px', color: '#475569' }}>
              Archives audit &amp; closed DPDP records older than 90 days into gzipped S3 cold storage with SHA-256 checksums.
            </p>
            {retentionResult && (
              <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                <div>Archived Count: <strong>{retentionResult.archivedCount ?? 0}</strong></div>
                <div>Storage Path: <code>{retentionResult.archivePath || retentionResult.key || 'Local/S3'}</code></div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">🛡️ Data &amp; Referential Integrity Diagnostic</h3>
              <button className="btn btn-sm btn-navy" onClick={handleRunIntegrity}>
                Run Check Now
              </button>
            </div>
            <p style={{ fontSize: '12.5px', color: '#475569' }}>
              Verifies scoring &amp; matching sums (=100), commission linkage to Sub-Stage C, and orphan FK checks.
            </p>
            {integrityResult && (
              <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                <div>
                  Status: <strong>{integrityResult.healthy !== false ? '✅ Healthy' : '⚠️ Issues Found'}</strong>
                </div>
                <pre style={{ margin: '6px 0 0', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(integrityResult.checks || integrityResult, null, 2).slice(0, 300)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function UsersView({
  users = [],
  teams = [],
  onRefresh,
  onShowToast,
}: {
  users: any[];
  teams: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user: currentUser } = useAuthStore();
  const [subTab, setSubTab] = useState<'employees' | 'roles'>('employees');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('Welcome@123');
  const [newRole, setNewRole] = useState('COUNSELLOR');
  const [newTeamId, setNewTeamId] = useState('');

  // Reset Password & Role Modal (zero window.prompt)
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetNewPass, setResetNewPass] = useState('');
  const [roleTarget, setRoleTarget] = useState<any | null>(null);
  const [targetRoleVal, setTargetRoleVal] = useState('COUNSELLOR');
  const [roleReason, setRoleReason] = useState('');
  const [loginHistoryTarget, setLoginHistoryTarget] = useState<{ user: any; logs: any[] } | null>(
    null
  );

  // Roles & Permissions Matrix
  const [rolesMatrix, setRolesMatrix] = useState<any[]>([]);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editingPermsJson, setEditingPermsJson] = useState('');

  useEffect(() => {
    if (subTab === 'roles') {
      apiCall('/roles')
        .then((res) => {
          const list = res?.roles || res?.data?.roles || res?.data || res;
          setRolesMatrix(Array.isArray(list) ? list : []);
        })
        .catch(() => {});
    }
  }, [subTab]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiCall('/users', 'POST', {
        fullName: newFullName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        teamId: newTeamId || undefined,
      });
      onShowToast(`Account created for ${newEmail}!`, 'success');
      setShowCreateModal(false);
      setNewFullName('');
      setNewEmail('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to create user.', 'danger');
    }
  };

  const handleUserAction = async (id: string, path: string, method: 'POST' | 'PATCH', okMsg: string) => {
    try {
      await apiCall(`/users/${id}/${path}`, method, {});
      onShowToast(okMsg, 'success');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Action failed.', 'danger');
    }
  };

  const handleViewLoginHistory = async (u: any) => {
    try {
      const res = await apiCall(`/users/${u.id}/login-history`);
      const logs = res?.history || res?.logs || res?.data?.history || res?.data || [];
      setLoginHistoryTarget({ user: u, logs: Array.isArray(logs) ? logs : [] });
    } catch (err: any) {
      onShowToast(err?.message || 'Could not fetch login history.', 'danger');
    }
  };

  const handleSaveRoleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleTarget) return;
    try {
      await apiCall(`/users/${roleTarget.id}/role`, 'PATCH', {
        role: targetRoleVal,
        reason: roleReason.trim() || 'Administrative role reassignment',
      });
      onShowToast('Role changed & active user sessions immediately revoked (Security Rule #13).', 'success');
      setRoleTarget(null);
      setRoleReason('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Role update failed.', 'danger');
    }
  };

  const handleSaveResetPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !resetNewPass) return;
    try {
      await apiCall(`/users/${resetTarget.id}/reset-password`, 'POST', {
        newPassword: resetNewPass,
      });
      onShowToast(`Password reset cleanly for ${resetTarget.fullName}.`, 'success');
      setResetTarget(null);
      setResetNewPass('');
    } catch (err: any) {
      onShowToast(err?.message || 'Password reset failed.', 'danger');
    }
  };

  const handleSaveRolePermissions = async () => {
    if (!editingRole) return;
    try {
      const parsed = JSON.parse(editingPermsJson);
      await apiCall(`/roles/${editingRole}/permissions`, 'PUT', { permissions: parsed });
      onShowToast(`Permissions updated for role ${editingRole}!`, 'success');
      setEditingRole(null);
      const res = await apiCall('/roles');
      const list = res?.roles || res?.data?.roles || res?.data || [];
      setRolesMatrix(Array.isArray(list) ? list : []);
    } catch (err: any) {
      onShowToast(err?.message || 'Invalid JSON or permission update rejected.', 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 className="card-title">👤 Employee Directory &amp; Role Matrix</h3>
          <span className="card-subtitle">
            Account lifecycle controls: unlock, suspend, force-logout, role reassignment (revokes JWT sessions) &amp; RBAC matrix
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn btn-sm ${subTab === 'employees' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setSubTab('employees')}
          >
            👥 Employees ({users.length})
          </button>
          <button
            className={`btn btn-sm ${subTab === 'roles' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setSubTab('roles')}
          >
            🛡️ Roles Matrix
          </button>
          {hasRole(currentUser?.role, 'SUPER_ADMIN') && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowCreateModal(true)}>
              ➕ Add Staff Account
            </button>
          )}
        </div>
      </div>

      {subTab === 'employees' ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Status</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.fullName}</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                      {u.email} &bull; {u.employeeId || u.employeeCode || u.id.slice(0, 6)}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-info">{u.role}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        u.status === 'active' || u.status === 'ACTIVE'
                          ? 'badge-success'
                          : 'badge-danger'
                      }`}
                    >
                      {u.status || 'active'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleViewLoginHistory(u)}
                      >
                        🕒 Logins
                      </button>
                      {hasRole(currentUser?.role, 'SUPER_ADMIN') && (
                        <>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => {
                              setRoleTarget(u);
                              setTargetRoleVal(u.role || 'COUNSELLOR');
                            }}
                          >
                            🔄 Role
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() =>
                              handleUserAction(u.id, 'unlock', 'POST', `${u.fullName} unlocked!`)
                            }
                          >
                            🔓 Unlock
                          </button>
                          <button
                            className="btn btn-sm btn-warning"
                            onClick={() =>
                              handleUserAction(
                                u.id,
                                'force-logout',
                                'POST',
                                `Forced logout on all devices for ${u.fullName}.`
                              )
                            }
                          >
                            🚪 Force Logout
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() =>
                              handleUserAction(
                                u.id,
                                'toggle-status',
                                'PATCH',
                                `Status toggled for ${u.fullName}.`
                              )
                            }
                          >
                            ⏯️ Toggle Active
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => setResetTarget(u)}
                          >
                            🔑 Reset Pass
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Role Name</th>
                <th>Module Permissions</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {rolesMatrix.map((r: any, idx: number) => (
                <tr key={r.role || r.name || idx}>
                  <td>
                    <strong>{r.role || r.name}</strong>
                  </td>
                  <td>
                    <code style={{ fontSize: '11px' }}>
                      {JSON.stringify(r.permissions || r.modules || {}).slice(0, 140)}
                    </code>
                  </td>
                  <td>
                    {hasRole(currentUser?.role, 'SUPER_ADMIN') && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setEditingRole(r.role || r.name);
                          setEditingPermsJson(
                            JSON.stringify(r.permissions || r.modules || {}, null, 2)
                          );
                        }}
                      >
                        ✏️ Edit JSON
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>➕ Create Employee Account</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowCreateModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Work Email *</label>
                  <input
                    type="email"
                    className="form-control"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Initial Password *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="form-control"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="COUNSELLOR">Jr. Counsellor</option>
                    <option value="SENIOR_MANAGER">Senior Manager</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>
                {teams.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Assign Team</label>
                    <select
                      className="form-control"
                      value={newTeamId}
                      onChange={(e) => setNewTeamId(e.target.value)}
                    >
                      <option value="">-- Optional --</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {roleTarget && (
        <div className="modal-overlay" onClick={() => setRoleTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>🔄 Change Role ({roleTarget.fullName})</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setRoleTarget(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveRoleChange}>
              <div className="modal-body">
                <p style={{ fontSize: '12px', color: '#B45309' }}>
                  Changing role immediately revokes all active JWT sessions for security.
                </p>
                <div className="form-group">
                  <label className="form-label">New Role</label>
                  <select
                    className="form-control"
                    value={targetRoleVal}
                    onChange={(e) => setTargetRoleVal(e.target.value)}
                  >
                    <option value="COUNSELLOR">Counsellor</option>
                    <option value="SENIOR_MANAGER">Senior Manager</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Audit Reason *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="Quarterly promotion / reassignment"
                    value={roleReason}
                    onChange={(e) => setRoleReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setRoleTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Role &amp; Force Logout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>🔑 Reset Password ({resetTarget.fullName})</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setResetTarget(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveResetPass}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Password *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={resetNewPass}
                    onChange={(e) => setResetNewPass(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setResetTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Login History Modal */}
      {loginHistoryTarget && (
        <div className="modal-overlay" onClick={() => setLoginHistoryTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
                🕒 Login History ({loginHistoryTarget.user.fullName})
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setLoginHistoryTarget(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {loginHistoryTarget.logs.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: '#64748B' }}>No recent login history entries.</div>
              ) : (
                loginHistoryTarget.logs.map((lg: any, i: number) => (
                  <div key={lg.id || i} style={{ padding: '8px 0', borderBottom: '1px solid #F1F5F9', fontSize: '12px' }}>
                    <strong>{lg.status || lg.event || 'LOGIN'}</strong> &bull; IP:{' '}
                    {lg.ipAddress || lg.ip || '127.0.0.1'} &bull;{' '}
                    {lg.createdAt ? new Date(lg.createdAt).toLocaleString() : ''}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Role Permissions Modal */}
      {editingRole && (
        <div className="modal-overlay" onClick={() => setEditingRole(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Edit Permissions ({editingRole})</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setEditingRole(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <textarea
                className="form-control"
                rows={10}
                value={editingPermsJson}
                onChange={(e) => setEditingPermsJson(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setEditingRole(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveRolePermissions}>
                Save Matrix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  // 5 Lead Scoring weights
  const [scoringWeights, setScoringWeights] = useState<Record<string, number>>({
    budget_match: 25,
    engagement: 25,
    source_quality: 20,
    timeline_urgency: 15,
    class_demand: 15,
  });

  // 8 Matching Criteria weights
  const [matchingWeights, setMatchingWeights] = useState<Record<string, number>>({
    class: 15,
    board: 15,
    fees_range: 15,
    state: 10,
    gender: 15,
    school_type: 10,
    facilities: 10,
    ranking: 10,
  });

  const [gstRate, setGstRate] = useState('18');
  const [tdsRate, setTdsRate] = useState('10');
  const [rateLimits, setRateLimits] = useState({ lead_create_per_hour: 60, wa_send_per_hour: 120 });
  const [jobs, setJobs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showLeadImport, setShowLeadImport] = useState(false);

  const loadSettingsData = async () => {
    try {
      const [scRes, mRes, gstRes, rlRes, jobRes, audRes] = await Promise.all([
        apiCall('/scoring/criteria').catch(() => null),
        apiCall('/match/criteria').catch(() => null),
        apiCall('/settings/gst-tds').catch(() => null),
        apiCall('/settings/rate-limits').catch(() => null),
        apiCall('/jobs/my-jobs').catch(() => null),
        apiCall('/audit-log?limit=25').catch(() => null),
      ]);

      const scList = scRes?.criteria || scRes?.weights || scRes?.data?.criteria || [];
      if (Array.isArray(scList) && scList.length > 0) {
        const next: Record<string, number> = {};
        for (const item of scList) next[item.criteriaKey || item.key] = Number(item.weight || 0);
        if (Object.keys(next).length === 5) setScoringWeights(next);
      }

      const mList = mRes?.criteria || mRes?.weights || mRes?.data?.criteria || [];
      if (Array.isArray(mList) && mList.length > 0) {
        const next: Record<string, number> = {};
        for (const item of mList) next[item.criteriaKey || item.key] = Number(item.weight || 0);
        if (Object.keys(next).length === 8) setMatchingWeights(next);
      }

      const gstVal = gstRes?.setting?.value || gstRes?.value || gstRes?.data?.value;
      if (gstVal) {
        setGstRate(String(gstVal.gstRate ?? 18));
        setTdsRate(String(gstVal.tdsRate ?? 10));
      }
      const rlVal = rlRes?.setting?.value || rlRes?.value || rlRes?.data?.value;
      if (rlVal) setRateLimits({ ...rateLimits, ...rlVal });

      setJobs(jobRes?.jobs || jobRes?.data?.jobs || []);
      setAuditLogs(audRes?.logs || audRes?.auditLogs || audRes?.data || []);
    } catch {
      // ignore non-admin partial errors
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, []);

  const scoringTotal = Object.values(scoringWeights).reduce((s, v) => s + Number(v || 0), 0);
  const matchingTotal = Object.values(matchingWeights).reduce((s, v) => s + Number(v || 0), 0);

  const handleSaveScoring = async () => {
    if (scoringTotal !== 100) return;
    try {
      await apiCall('/scoring/criteria', 'PUT', scoringWeights);
      onShowToast('Lead Scoring 5-factor weights saved (Total: 100 ✓)!', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to save scoring weights.', 'danger');
    }
  };

  const handleSaveMatching = async () => {
    if (matchingTotal !== 100) return;
    try {
      await apiCall('/match/criteria', 'PUT', matchingWeights);
      onShowToast('Matching Criteria 8-factor weights saved (Total: 100 ✓)!', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to save matching weights.', 'danger');
    }
  };

  const handleSaveFinanceAndLimits = async () => {
    try {
      await Promise.all([
        apiCall('/settings/gst-tds', 'PUT', { gstRate: Number(gstRate), tdsRate: Number(tdsRate) }),
        apiCall('/settings/rate-limits', 'PUT', rateLimits),
      ]);
      onShowToast('GST/TDS & API Rate Limits saved to PostgreSQL.', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update settings.', 'danger');
    }
  };

  const handleTriggerJob = async (type: string) => {
    try {
      await apiCall('/jobs/trigger', 'POST', { type, payload: {} });
      onShowToast(`Background job ${type} triggered cleanly.`, 'success');
      loadSettingsData();
    } catch (err: any) {
      onShowToast(err?.message || 'Job trigger failed.', 'danger');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Feature 1 & Feature 2: Strict Total = 100 Weight Configurators */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">🎯 Feature 1: Lead Scoring Weights (5 Factors)</h3>
              <span className="card-subtitle">Must sum to exactly 100</span>
            </div>
            <span
              className={`badge ${scoringTotal === 100 ? 'badge-success' : 'badge-danger'}`}
              style={{ fontSize: '12px' }}
            >
              Total: {scoringTotal} {scoringTotal === 100 ? '✓' : '✗'}
            </span>
          </div>
          {Object.entries(scoringWeights).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <label style={{ fontSize: '12.5px', fontWeight: 600 }}>{k}</label>
              <input
                type="number"
                className="form-control"
                style={{ maxWidth: '100px' }}
                value={v}
                onChange={(e) =>
                  setScoringWeights((prev) => ({ ...prev, [k]: Number(e.target.value || 0) }))
                }
              />
            </div>
          ))}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={scoringTotal !== 100 || !hasRole(user?.role, 'SUPER_ADMIN')}
            onClick={handleSaveScoring}
          >
            Save Lead Scoring Weights ({scoringTotal === 100 ? 'Total: 100 ✓' : `Invalid: ${scoringTotal} ✗`})
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">🏫 Feature 2: School Matching Weights (8 Criteria)</h3>
              <span className="card-subtitle">Must sum to exactly 100</span>
            </div>
            <span
              className={`badge ${matchingTotal === 100 ? 'badge-success' : 'badge-danger'}`}
              style={{ fontSize: '12px' }}
            >
              Total: {matchingTotal} {matchingTotal === 100 ? '✓' : '✗'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {Object.entries(matchingWeights).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>{k}</label>
                <input
                  type="number"
                  className="form-control"
                  style={{ maxWidth: '75px' }}
                  value={v}
                  onChange={(e) =>
                    setMatchingWeights((prev) => ({ ...prev, [k]: Number(e.target.value || 0) }))
                  }
                />
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px' }}
            disabled={matchingTotal !== 100 || !hasRole(user?.role, 'SUPER_ADMIN')}
            onClick={handleSaveMatching}
          >
            Save Matching Criteria ({matchingTotal === 100 ? 'Total: 100 ✓' : `Invalid: ${matchingTotal} ✗`})
          </button>
        </div>
      </div>

      {/* GST/TDS, Rate Limits & Lead Import */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">⚙️ System Controls, Tax Rates &amp; 2-Step Lead Import</h3>
          {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowLeadImport(true)}>
              📥 Bulk Import Leads (Preview → Confirm)
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <div>
            <label className="form-label">GST Rate (%)</label>
            <input
              type="number"
              className="form-control"
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">TDS Rate (%)</label>
            <input
              type="number"
              className="form-control"
              value={tdsRate}
              onChange={(e) => setTdsRate(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Leads / Hour Rate Limit</label>
            <input
              type="number"
              className="form-control"
              value={rateLimits.lead_create_per_hour}
              onChange={(e) =>
                setRateLimits((r) => ({ ...r, lead_create_per_hour: Number(e.target.value || 0) }))
              }
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className="btn btn-success"
              disabled={!hasRole(user?.role, 'SUPER_ADMIN')}
              onClick={handleSaveFinanceAndLimits}
            >
              💾 Save Governance Settings
            </button>
          </div>
        </div>
      </div>

      {/* Background Jobs & Live Audit Log */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">⏱️ BullMQ Background Jobs ({jobs.length})</h3>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => handleTriggerJob('RECALCULATE_LEAD_SCORES')}
            >
              ⚡ Recalculate All Scores
            </button>
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto', fontSize: '12px' }}>
            {jobs.length === 0 ? (
              <div style={{ color: '#64748B' }}>No background jobs recorded yet.</div>
            ) : (
              jobs.slice(0, 10).map((j: any) => (
                <div key={j.id} style={{ padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <strong>{j.jobType || j.type}</strong> &bull;{' '}
                  <span className="badge badge-info">{j.status || j.state}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📜 Recent Centralized Audit Log</h3>
            <button className="btn btn-sm btn-outline" onClick={loadSettingsData}>
              🔄
            </button>
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto', fontSize: '12px' }}>
            {auditLogs.length === 0 ? (
              <div style={{ color: '#64748B' }}>No audit log entries loaded.</div>
            ) : (
              auditLogs.slice(0, 12).map((a: any, i: number) => (
                <div key={a.id || i} style={{ padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <strong>{a.module}</strong> &bull; {a.action} &bull;{' '}
                  <span style={{ color: '#64748B' }}>
                    {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <BulkImportModal
        entity="leads"
        isOpen={showLeadImport}
        onClose={() => setShowLeadImport(false)}
        onSuccess={loadSettingsData}
        onShowToast={onShowToast}
      />
    </div>
  );
}

export function AuthenticatorSetupView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user, setUser } = useAuthStore();
  const [setupData, setSetupData] = useState<any>(null);
  const [otpInput, setOtpInput] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableBox, setShowDisableBox] = useState(false);

  // Notification Preferences & VAPID Web Push
  const [prefs, setPrefs] = useState({ inApp: true, email: true, pushEnabled: true });
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    apiCall('/notifications/preferences')
      .then((res) => {
        const p = res?.preferences || res?.data || res;
        if (p) {
          setPrefs({
            inApp: p.inApp !== false,
            email: p.email !== false,
            pushEnabled: p.pushEnabled !== false,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleInitSetup = async () => {
    try {
      const res = await apiCall('/security/2fa/setup', 'POST', {});
      setSetupData(res?.data || res);
      onShowToast('Scan QR / copy TOTP secret and enter 6-digit code below.', 'success');
    } catch (err: any) {
      onShowToast(err?.message || '2FA setup init failed.', 'danger');
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiCall('/security/2fa/verify', 'POST', { code: otpInput.trim(), otp: otpInput.trim() });
      onShowToast('Two-Factor Authentication enabled cleanly!', 'success');
      if (user) setUser({ ...user, twoFaEnabled: true, is2faEnabled: true });
      setSetupData(null);
      setOtpInput('');
    } catch (err: any) {
      onShowToast(err?.message || 'Invalid TOTP verification code.', 'danger');
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) return;
    try {
      await apiCall('/security/2fa/disable', 'POST', { password: disablePassword });
      onShowToast('2FA disabled cleanly.', 'warning');
      if (user) setUser({ ...user, twoFaEnabled: false, is2faEnabled: false });
      setShowDisableBox(false);
      setDisablePassword('');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to disable 2FA.', 'danger');
    }
  };

  const handleSavePrefs = async () => {
    try {
      await apiCall('/notifications/preferences', 'PUT', prefs);
      onShowToast('Notification preferences updated!', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Preference update failed.', 'danger');
    }
  };

  const handleToggleWebPush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        onShowToast('Browser does not support Service Worker Push API in this context.', 'warning');
        return;
      }
      if (!pushSubscribed) {
        const keyRes = await apiCall('/push/vapid-public-key');
        const publicKey = keyRes?.publicKey || keyRes?.data?.publicKey;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
        await apiCall('/push/subscribe', 'POST', { subscription: sub.toJSON() });
        setPushSubscribed(true);
        onShowToast('Web Push notifications enabled on this device!', 'success');
      } else {
        await apiCall('/push/unsubscribe', 'POST', {});
        setPushSubscribed(false);
        onShowToast('Web Push unsubscribed cleanly.', 'warning');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Push subscription skipped/blocked by browser.', 'warning');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🛡️ Two-Factor Authentication (TOTP)</h3>
          <span className={`badge ${user?.twoFaEnabled ? 'badge-success' : 'badge-warning'}`}>
            {user?.twoFaEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p style={{ fontSize: '12.5px', color: '#475569' }}>
          Protect your BoardingEdu account using Google Authenticator / Microsoft Authenticator &amp; 8-character recovery codes.
        </p>

        {!user?.twoFaEnabled ? (
          <div>
            {!setupData ? (
              <button className="btn btn-primary" onClick={handleInitSetup}>
                🔐 Generate 2FA Secret &amp; QR
              </button>
            ) : (
              <form onSubmit={handleVerifySetup} style={{ marginTop: '10px' }}>
                {setupData.qrCodeDataUrl && (
                  <img
                    src={setupData.qrCodeDataUrl}
                    alt="2FA QR Code"
                    style={{ width: '160px', height: '160px', border: '1px solid #E2E8F0', borderRadius: '8px' }}
                  />
                )}
                <div style={{ fontSize: '12px', margin: '8px 0' }}>
                  Secret: <code>{setupData.secret}</code>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter 6-digit OTP"
                    required
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                  />
                  <button type="submit" className="btn btn-success">
                    Enable 2FA
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div>
            {!showDisableBox ? (
              <button className="btn btn-danger btn-sm" onClick={() => setShowDisableBox(true)}>
                Disable 2FA
              </button>
            ) : (
              <form onSubmit={handleDisable2FA} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Confirm current password"
                  required
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
                <button type="submit" className="btn btn-danger btn-sm">
                  Confirm Disable
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🔔 Notification Preferences &amp; VAPID Push</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={prefs.inApp}
              onChange={(e) => setPrefs((p) => ({ ...p, inApp: e.target.checked }))}
            />
            Real-time Socket.IO In-App Notifications
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={prefs.email}
              onChange={(e) => setPrefs((p) => ({ ...p, email: e.target.checked }))}
            />
            Email Alerts (Follow-up Escalations &amp; Payouts)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={prefs.pushEnabled}
              onChange={(e) => setPrefs((p) => ({ ...p, pushEnabled: e.target.checked }))}
            />
            Enable PWA Browser Push Notifications
          </label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSavePrefs}>
              Save Preferences
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleToggleWebPush}>
              {pushSubscribed ? '🔕 Unsubscribe Device Push' : '📲 Register This Device for Push'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SessionsView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [sessions, setSessions] = useState<any[]>([]);

  const loadSessions = async () => {
    try {
      const res = await apiCall('/sessions');
      setSessions(res?.sessions || res?.data?.sessions || res?.data || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevokeOne = async (id: string) => {
    try {
      await apiCall(`/sessions/${id}`, 'DELETE');
      onShowToast('Device session revoked cleanly.', 'success');
      loadSessions();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to revoke session.', 'danger');
    }
  };

  const handleRevokeAll = async () => {
    try {
      await apiCall('/auth/revoke-sessions', 'POST', {});
      onShowToast('All other device sessions logged out cleanly!', 'success');
      loadSessions();
    } catch (err: any) {
      onShowToast(err?.message || 'Revoke other sessions failed.', 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">💻 Active Device Sessions ({sessions.length})</h3>
          <span className="card-subtitle">
            Refresh-token family tracking with reuse detection and one-click remote sign-out
          </span>
        </div>
        <button className="btn btn-danger btn-sm" onClick={handleRevokeAll}>
          🚪 Revoke All Other Sessions
        </button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Device / User Agent</th>
              <th>IP</th>
              <th>Expires</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s: any) => (
              <tr key={s.id}>
                <td><code>{s.id.slice(0, 10)}</code></td>
                <td>{s.deviceInfo || s.userAgent || 'Browser Session'}</td>
                <td>{s.ipAddress || '127.0.0.1'}</td>
                <td>{s.expiresAt ? new Date(s.expiresAt).toLocaleString() : '-'}</td>
                <td>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => handleRevokeOne(s.id)}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
