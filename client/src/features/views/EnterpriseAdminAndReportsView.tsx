import React, { useEffect, useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall, downloadApiFile } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { hasRole } from '../../lib/roles';
import { BulkImportModal } from './FinanceAndSchoolsView';

const ALL_20_REPORTS = [
  { slug: 'leads', label: '1. Leads Master Report' },
  { slug: 'pipeline', label: '2. Stage Pipeline Conversion' },
  { slug: 'admissions', label: '3. Confirmed Admissions Report (Sheet 3)' },
  { slug: 'full-admission-process', label: '★ End-to-End Admission Full Process Lifecycle' },
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

  const handleDownloadMasterWorkbook = async () => {
    try {
      await downloadApiFile(
        '/reports/master-export',
        'CRM_Master_Complete_Workbook.xlsx'
      );
      onShowToast('Master 5-Sheet CRM Workbook (.xlsx) downloaded successfully!', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to download Master Workbook.', 'danger');
    }
  };

  const columns =
    reportRows.length > 0 && typeof reportRows[0] === 'object' && reportRows[0] !== null
      ? Object.keys(reportRows[0])
      : ['summary'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 className="card-title"><CrmIcon name="trending-up" size={16} /> Enterprise Analytics &amp; 20-Report Export Suite</h3>
            <span className="card-subtitle">
              Real-time PostgreSQL aggregations with JSON preview, authenticated Excel/PDF downloads &amp; BullMQ async jobs
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" onClick={handleRunReport} disabled={loadingReport}>
              <CrmIcon name="refresh" size={16} /> {loadingReport ? 'Loading...' : 'Refresh'}
            </button>
            <button className="btn btn-sm btn-success" onClick={() => handleDownload('excel')}>
              <CrmIcon name="bar-chart" size={16} /> Export Excel
            </button>
            <button
              className="btn btn-sm btn-primary"
              style={{ background: '#0284C7', borderColor: '#0284C7', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={async () => {
                try {
                  await downloadApiFile(
                    `/reports/full-admission-process${buildQuery('format=excel')}`,
                    'Admission_Full_Process_Master.xlsx'
                  );
                  onShowToast('Admission Complete Process Excel report downloaded successfully!', 'success');
                } catch (err: any) {
                  onShowToast(err?.message || 'Download failed.', 'danger');
                }
              }}
            >
              <CrmIcon name="graduation-cap" size={15} /> Full Admission Process (.xlsx)
            </button>
            <button
              className="btn btn-sm btn-primary"
              style={{ background: '#0D9488', borderColor: '#0D9488', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={handleDownloadMasterWorkbook}
            >
              <CrmIcon name="download" size={15} /> Master CRM Workbook (.xlsx)
            </button>
            <button className="btn btn-sm btn-navy" onClick={() => handleDownload('pdf')}>
              <CrmIcon name="file-text" size={16} /> Export PDF
            </button>
            <button className="btn btn-sm btn-outline" onClick={handleTriggerAsyncReport}>
              <CrmIcon name="settings" size={16} /> Async BullMQ Export
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '10px' }}>
          <div>
            <label className="form-label">Select Blueprint Report (1–20)</label>
            <select
              className="form-control"
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
            >
              {ALL_20_REPORTS.map((r) => (
                <option key={r.slug} value={r.slug}>{r.label}</option>
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

        {/* Quick Date Range Filter Presets */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Quick Date Filters:</span>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ padding: '3px 8px', fontSize: '11.5px', background: !dateFrom && !dateTo ? '#EFF6FF' : undefined }}
            onClick={() => { setDateFrom(''); setDateTo(''); }}
          >
            All-Time (Permanent)
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ padding: '3px 8px', fontSize: '11.5px' }}
            onClick={() => { setDateFrom('2026-04-01'); setDateTo('2027-03-31'); }}
          >
            Session 2026-27
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ padding: '3px 8px', fontSize: '11.5px' }}
            onClick={() => { setDateFrom('2025-04-01'); setDateTo('2026-03-31'); }}
          >
            Past Session 2025-26
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ padding: '3px 8px', fontSize: '11.5px' }}
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 30);
              setDateFrom(d.toISOString().slice(0, 10));
              setDateTo(new Date().toISOString().slice(0, 10));
            }}
          >
            Last 30 Days
          </button>
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
                <CrmIcon name="download" size={16} /> Download Output
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
              <h3 className="card-title"><CrmIcon name="archive" size={16} /> 90-Day S3 (.json.gz) Retention Archive</h3>
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
              <h3 className="card-title"><CrmIcon name="shield" size={16} /> Data &amp; Referential Integrity Diagnostic</h3>
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
                  Status: <strong>{integrityResult.healthy !== false ? 'Healthy' : 'Issues Found'}</strong>
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
  viewMode = 'all',
  onRefresh,
  onShowToast,
}: {
  users: any[];
  teams: any[];
  viewMode?: 'all' | 'managers' | 'counsellors';
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user: currentUser } = useAuthStore();
  const [subTab, setSubTab] = useState<'employees' | 'roles'>('employees');
  const [selectedStaffDetail, setSelectedStaffDetail] = useState<any | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newPassword, setNewPassword] = useState('Welcome@123');
  const [newRole, setNewRole] = useState('COUNSELLOR');
  const [newTeamId, setNewTeamId] = useState('');
  const [newManagerId, setNewManagerId] = useState('');
  const [newManualTeamName, setNewManualTeamName] = useState('');
  const [newBankAccount, setNewBankAccount] = useState('');
  const [editBankInput, setEditBankInput] = useState('');
  const [fnfTransferToId, setFnfTransferToId] = useState('');

  // Reset Password & Role Modal (zero window.prompt)
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetNewPass, setResetNewPass] = useState('');
  const [roleTarget, setRoleTarget] = useState<any | null>(null);
  const [targetRoleVal, setTargetRoleVal] = useState('COUNSELLOR');
  const [targetTeamIdVal, setTargetTeamIdVal] = useState('');
  const [targetManualTeamName, setTargetManualTeamName] = useState('');
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
        phone: newMobile.trim() || undefined,
        mobile: newMobile.trim() || undefined,
        password: newPassword,
        role: newRole,
        managerId: newManagerId || undefined,
        teamId: newManualTeamName.trim() ? undefined : newTeamId || undefined,
        customTeamName: newManualTeamName.trim() || undefined,
        bankAccount: newBankAccount.trim() || undefined,
      });
      onShowToast(
        `Account created for ${newEmail}${newManualTeamName.trim() ? ` in team "${newManualTeamName.trim()}"` : ''}!`,
        'success'
      );
      setShowCreateModal(false);
      setNewFullName('');
      setNewEmail('');
      setNewMobile('');
      setNewManagerId('');
      setNewBankAccount('');
      setNewManualTeamName('');
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
        teamId: targetManualTeamName.trim() ? undefined : targetTeamIdVal || undefined,
        customTeamName: targetManualTeamName.trim() || undefined,
        reason: roleReason.trim() || 'Administrative role/team reassignment',
      });
      onShowToast('Employee role & team updated cleanly!', 'success');
      setRoleTarget(null);
      setTargetManualTeamName('');
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
          <h3 className="card-title">
            <CrmIcon name="user" size={16} />{' '}
            {viewMode === 'managers'
              ? 'Manager Management & Assigned Teams'
              : viewMode === 'counsellors'
              ? 'Counsellor Management & Team Mapping'
              : 'Employee Directory & Role Matrix'}
          </h3>
          <span className="card-subtitle">
            {viewMode === 'managers'
              ? 'View every Manager along with their assigned Team Name, counsellors, and live status'
              : viewMode === 'counsellors'
              ? 'Click any Counsellor to inspect their Team Name, Reporting Manager, and teammates'
              : 'Account lifecycle controls: team mapping, unlock, suspend, force-logout, role reassignment & RBAC matrix'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn btn-sm ${subTab === 'employees' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setSubTab('employees')}
          >
            <CrmIcon name="users" size={16} />{' '}
            {viewMode === 'managers'
              ? `Managers (${users.length})`
              : viewMode === 'counsellors'
              ? `Counsellors (${users.length})`
              : `Employees (${users.length})`}
          </button>
          <button
            className={`btn btn-sm ${subTab === 'roles' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setSubTab('roles')}
          >
            <CrmIcon name="shield" size={16} /> Roles Matrix
          </button>
          {hasRole(currentUser?.role, 'SUPER_ADMIN') && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowCreateModal(true)}>
              <CrmIcon name="plus" size={16} /> Add Staff Account
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
                <th>Team &amp; Manager</th>
                <th>Status</th>
                <th>Login / Logout Time</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => {
                const isUserOnline =
                  u.isOnline === true ||
                  u.presenceStatus === 'online' ||
                  u.id === currentUser?.id;
                const resolvedTeamName =
                  u.teamName ||
                  u.team?.name ||
                  u.teamId?.teamName ||
                  u.teamId?.name ||
                  teams.find((t: any) => t.id === (u.teamId?.id || u.teamId) || t.managerId === u.id)?.name ||
                  null;
                const isMgr = String(u.role || u.canonicalRole || '').toLowerCase().includes('manager');
                const isCounsellor = String(u.role || u.canonicalRole || '').toLowerCase().includes('counsellor');
                const teamMembersCount = Array.isArray(u.teamMembers)
                  ? u.teamMembers.filter((m: any) => m.id !== u.id).length
                  : 0;
                const formatDateTime = (dt: any) =>
                  dt
                    ? new Date(dt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : null;
                const loginTimeStr = formatDateTime(u.lastLoginAt);
                const logoutTimeStr = formatDateTime(u.lastLogoutAt);
                return (
                <tr key={u.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedStaffDetail(u)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                      title="Click to view Team Name & Staff Details"
                    >
                      <strong style={{ color: '#0F172A', textDecoration: 'underline', textDecorationColor: '#CBD5E1' }}>
                        {u.fullName}
                      </strong>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        {u.email} &bull; {u.employeeId || u.employeeCode || u.id.slice(0, 6)}
                      </div>
                    </button>
                  </td>
                  <td>
                    <span className="badge badge-info">{u.role}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedStaffDetail(u)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          background: resolvedTeamName
                            ? isMgr
                              ? '#EFF6FF'
                              : '#ECFDF5'
                            : '#F8FAFC',
                          color: resolvedTeamName
                            ? isMgr
                              ? '#1D4ED8'
                              : '#047857'
                            : '#64748B',
                          border: `1px solid ${
                            resolvedTeamName
                              ? isMgr
                                ? '#BFDBFE'
                                : '#A7F3D0'
                              : '#E2E8F0'
                          }`,
                          borderRadius: '999px',
                          padding: '3px 10px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Click to view full Team details"
                      >
                        <CrmIcon name="users" size={12} />
                        {resolvedTeamName ? `Team: ${resolvedTeamName}` : 'Unassigned'}
                      </button>
                      {isCounsellor && u.managerName && (
                        <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                          Manager: {u.managerName}
                        </span>
                      )}
                      {isMgr && resolvedTeamName && (
                        <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                          {teamMembersCount} {teamMembersCount === 1 ? 'Counsellor' : 'Counsellors'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span
                        className={`badge ${
                          isUserOnline ? 'badge-success' : 'badge-secondary'
                        }`}
                        style={{
                          background: isUserOnline ? '#DCFCE7' : '#F1F5F9',
                          color: isUserOnline ? '#15803D' : '#475569',
                          fontWeight: 700,
                        }}
                      >
                        ● {isUserOnline ? 'Online' : 'Offline'}
                      </span>
                      {u.status && u.status !== 'active' && u.status !== 'ACTIVE' && (
                        <span className="badge badge-danger">{u.status}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '11.5px', lineHeight: 1.55, whiteSpace: 'nowrap' }}>
                      <div style={{ color: '#0F172A', fontWeight: 600 }}>
                        <span style={{ color: '#16A34A', fontWeight: 700 }}>Login:</span>{' '}
                        {loginTimeStr || <span style={{ color: '#94A3B8', fontWeight: 500 }}>Not logged in</span>}
                      </div>
                      <div style={{ color: '#334155', fontWeight: 600 }}>
                        <span style={{ color: '#DC2626', fontWeight: 700 }}>Logout:</span>{' '}
                        {logoutTimeStr ? (
                          logoutTimeStr
                        ) : isUserOnline ? (
                          <span style={{ color: '#16A34A', fontWeight: 600 }}>Active now</span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontWeight: 500 }}>—</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleViewLoginHistory(u)}
                      >
                        <CrmIcon name="clock" size={16} /> Logins
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
                            <CrmIcon name="refresh" size={16} /> Role
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() =>
                              handleUserAction(u.id, 'unlock', 'POST', `${u.fullName} unlocked!`)
                            }
                          >
                            <CrmIcon name="unlock" size={16} /> Unlock
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
                            <CrmIcon name="logout" size={16} /> Force Logout
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
                            title="Activate or Suspend this employee account"
                          >
                            <CrmIcon name="play" size={16} /> Toggle Active
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => setResetTarget(u)}
                          >
                            <CrmIcon name="key" size={16} /> Reset Pass
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
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
                        <CrmIcon name="edit" size={16} /> Edit JSON
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
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}><CrmIcon name="plus" size={16} /> Create Employee Account</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowCreateModal(false)}>
                <CrmIcon name="x" size={16} />
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
                  <label className="form-label">Mobile Number (+91)</label>
                  <input
                    type="tel"
                    className="form-control"
                    placeholder="9876543210"
                    value={newMobile}
                    onChange={(e) => setNewMobile(e.target.value)}
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
                    <option value="COUNSELLOR">Jr. Counsellor (Max 5 per Manager)</option>
                    <option value="SENIOR_MANAGER">Senior Manager</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>
                {newRole === 'COUNSELLOR' && (
                  <div className="form-group">
                    <label className="form-label">Assigned Manager (1 Manager → Max 5 Jr. Counsellors)</label>
                    <select
                      className="form-control"
                      value={newManagerId}
                      onChange={(e) => setNewManagerId(e.target.value)}
                    >
                      <option value="">-- Optional: Select Reporting Manager --</option>
                      {users
                        .filter((u: any) => String(u.role || u.canonicalRole || '').toLowerCase().includes('manager'))
                        .map((m: any) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName} {m.teamName ? `(Team: ${m.teamName})` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Bank Account / IFSC (AES-256 Encrypted at Rest)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. HDFC0001234 / Acct: 501002345678"
                    value={newBankAccount}
                    onChange={(e) => setNewBankAccount(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Assign Existing Team</label>
                  <select
                    className="form-control"
                    value={newTeamId}
                    onChange={(e) => {
                      setNewTeamId(e.target.value);
                      if (e.target.value) setNewManualTeamName('');
                    }}
                  >
                    <option value="">-- Select Existing Team (Or Type Manual Below) --</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <CrmIcon name="edit" size={16} /> Or Enter Custom Team Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Team Alpha / Dehradun Pioneers / Ankita Team..."
                    value={newManualTeamName}
                    onChange={(e) => {
                      setNewManualTeamName(e.target.value);
                      if (e.target.value) setNewTeamId('');
                    }}
                  />
                </div>
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
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}><CrmIcon name="refresh" size={16} /> Change Role ({roleTarget.fullName})</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setRoleTarget(null)}>
                <CrmIcon name="x" size={16} />
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
                  <label className="form-label">Assign Existing Team</label>
                  <select
                    className="form-control"
                    value={targetTeamIdVal}
                    onChange={(e) => {
                      setTargetTeamIdVal(e.target.value);
                      if (e.target.value) setTargetManualTeamName('');
                    }}
                  >
                    <option value="">-- Keep Current / Or Type Manual Below --</option>
                    {teams.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <CrmIcon name="edit" size={16} /> Or Enter Custom Team Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Type any new or custom team name..."
                    value={targetManualTeamName}
                    onChange={(e) => {
                      setTargetManualTeamName(e.target.value);
                      if (e.target.value) setTargetTeamIdVal('');
                    }}
                  />
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

      {/* Staff & Team Details Modal */}
      {selectedStaffDetail && (() => {
        const st = selectedStaffDetail;
        const resolvedTeamObj =
          teams.find(
            (t: any) =>
              t.id === (st.teamId?.id || st.teamId) ||
              t.managerId === st.id
          ) || null;
        const teamName =
          st.teamName ||
          st.team?.name ||
          st.teamId?.teamName ||
          st.teamId?.name ||
          resolvedTeamObj?.name ||
          'Unassigned';
        const teamCode = st.teamCode || st.teamId?.teamCode || resolvedTeamObj?.teamCode || null;
        const isMgr = String(st.role || st.canonicalRole || '').toLowerCase().includes('manager');
        const isOnlineSt =
          st.isOnline === true || st.presenceStatus === 'online' || st.id === currentUser?.id;
        const membersList: any[] = Array.isArray(st.teamMembers)
          ? st.teamMembers.filter((m: any) => m.id !== st.id)
          : [];
        return (
          <div className="modal-overlay" onClick={() => setSelectedStaffDetail(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="modal-header" style={{ background: 'linear-gradient(95deg, #09204C 0%, #143D85 60%, #1D4ED8 100%)', color: '#FFFFFF' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
                    {st.fullName}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>
                    {isMgr ? 'Team Manager' : st.role === 'admin' ? 'Super Admin' : 'Admissions Counsellor'} &bull; {st.employeeId || st.email}
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ background: 'rgba(255,255,255,0.16)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.35)' }}
                  onClick={() => setSelectedStaffDetail(null)}
                >
                  <CrmIcon name="x" size={16} />
                </button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    background: teamName !== 'Unassigned' ? '#EFF6FF' : '#F8FAFC',
                    border: `1px solid ${teamName !== 'Unassigned' ? '#BFDBFE' : '#E2E8F0'}`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>
                      {isMgr ? 'Managed Team Name' : 'Assigned Team Name'}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E3A8A', marginTop: '2px' }}>
                      {teamName}
                    </div>
                    {teamCode && (
                      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                        Team Code: {teamCode}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      background: isOnlineSt ? '#DCFCE7' : '#F1F5F9',
                      color: isOnlineSt ? '#15803D' : '#475569',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                    }}
                  >
                    ● {isOnlineSt ? 'Online' : 'Offline'}
                  </span>
                </div>

                {!isMgr && st.managerName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '10px 12px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>Reporting Manager</span>
                    <strong style={{ color: '#0F172A' }}>{st.managerName}</strong>
                  </div>
                )}

                <div style={{ fontSize: '12.5px', color: '#334155', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>EMAIL</div>
                    <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{st.email || '—'}</div>
                  </div>
                  <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>PHONE</div>
                    <div style={{ fontWeight: 600 }}>{st.phone || st.mobile || '—'}</div>
                  </div>
                </div>

                {hasRole(currentUser?.role, 'SUPER_ADMIN') && (
                  <div style={{ padding: '10px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ color: '#166534' }}>AES-256 Encrypted Bank Account</strong>
                      <span className="badge badge-success">{st.bankAccountMasked || 'Not Configured'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ fontSize: '12px', padding: '5px 8px' }}
                        placeholder="Update Bank Acct / IFSC (AES-256)..."
                        value={editBankInput}
                        onChange={(e) => setEditBankInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={async () => {
                          if (!editBankInput.trim()) return;
                          try {
                            await apiCall(`/users/${st.id}`, 'PUT', { bankAccount: editBankInput.trim() });
                            onShowToast('Bank details encrypted (AES-256-GCM) & saved!', 'success');
                            setEditBankInput('');
                            setSelectedStaffDetail(null);
                            onRefresh();
                          } catch (err: any) {
                            onShowToast(err?.message || 'Could not update bank details.', 'danger');
                          }
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {hasRole(currentUser?.role, 'SUPER_ADMIN') && (
                  <div style={{ padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', fontSize: '12px' }}>
                    <strong style={{ color: '#92400E', display: 'block', marginBottom: '6px' }}>
                      Suspend Account &amp; Reassign Active Leads (90-Day FNF)
                    </strong>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <select
                        className="form-control"
                        style={{ flex: 1, fontSize: '12px', padding: '5px 8px' }}
                        value={fnfTransferToId}
                        onChange={(e) => setFnfTransferToId(e.target.value)}
                      >
                        <option value="">-- Optional: Reassign Active Leads To --</option>
                        {users
                          .filter((u: any) => u.id !== st.id && u.isActive !== false)
                          .map((u: any) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName} ({u.role})
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm btn-warning"
                        onClick={async () => {
                          try {
                            await apiCall(`/users/${st.id}/suspend`, 'PUT', {
                              transferToId: fnfTransferToId || undefined,
                            });
                            onShowToast(
                              `${st.fullName} suspended (history preserved${fnfTransferToId ? ', active leads reassigned' : ''}).`,
                              'warning'
                            );
                            setFnfTransferToId('');
                            setSelectedStaffDetail(null);
                            onRefresh();
                          } catch (err: any) {
                            onShowToast(err?.message || 'Suspend failed.', 'danger');
                          }
                        }}
                      >
                        Suspend &amp; Transfer
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    {isMgr ? `Team Counsellors (${membersList.length})` : `Teammates in ${teamName} (${membersList.length})`}
                  </div>
                  {membersList.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#64748B', padding: '10px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                      {isMgr ? 'No counsellors assigned to this team yet.' : 'No other teammates listed in this team.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                      {membersList.map((m: any) => (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 10px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            fontSize: '12.5px',
                          }}
                        >
                          <div>
                            <strong style={{ color: '#0F172A' }}>{m.fullName}</strong>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>{m.email}</div>
                          </div>
                          <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>
                            {m.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                {hasRole(currentUser?.role, 'SUPER_ADMIN') && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      const target = st;
                      setSelectedStaffDetail(null);
                      setRoleTarget(target);
                      setTargetRoleVal(target.role || 'COUNSELLOR');
                    }}
                  >
                    <CrmIcon name="refresh" size={14} /> Change Team / Role
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={() => setSelectedStaffDetail(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}><CrmIcon name="key" size={16} /> Reset Password ({resetTarget.fullName})</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setResetTarget(null)}>
                <CrmIcon name="x" size={16} />
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
                <CrmIcon name="clock" size={16} /> Login History ({loginHistoryTarget.user.fullName})
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setLoginHistoryTarget(null)}>
                <CrmIcon name="x" size={16} />
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
                <CrmIcon name="x" size={16} />
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
  const [rateLimits, setRateLimits] = useState({
    lead_create_per_hour: 50,
    lead_merge_per_hour: 10,
    excel_import_per_hour: 2,
    wa_send_per_hour: 120,
  });
  const [jobs, setJobs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showLeadImport, setShowLeadImport] = useState(false);
  const [matchingPreviewList, setMatchingPreviewList] = useState<any[]>([]);
  const [testingMatch, setTestingMatch] = useState(false);

  const handleTestMatchingPreview = async () => {
    setTestingMatch(true);
    try {
      const res = await apiCall('/match/test', 'POST', {
        preferredBoard: 'CBSE',
        preferredLocation: 'Dehradun',
        budgetMax: 600000,
        admissionClass: 'Class 8',
      });
      const list =
        res?.suggested_schools ||
        res?.data?.suggested_schools ||
        res?.matches ||
        [];
      setMatchingPreviewList(Array.isArray(list) ? list.slice(0, 5) : []);
      onShowToast(`Matching preview calculated (${Array.isArray(list) ? list.length : 0} schools scored).`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Matching preview test failed.', 'danger');
    } finally {
      setTestingMatch(false);
    }
  };

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
      await apiCall('/leads/recalculate-all-scores', 'POST', {}).catch(() => null);
      onShowToast('Lead Scoring weights saved & all lead scores recalculated successfully!', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to save scoring weights.', 'danger');
    }
  };

  const handleSaveMatching = async () => {
    if (matchingTotal !== 100) return;
    try {
      await apiCall('/match/criteria', 'PUT', matchingWeights);
      onShowToast('Matching Criteria 8-factor weights saved (Total: 100 )!', 'success');
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

  const SCORING_LABELS_MAP: Record<string, { label: string; icon: string }> = {
    budget_match: { label: 'Budget Match', icon: 'credit-card' },
    class_demand: { label: 'Class Demand', icon: 'book-open' },
    engagement: { label: 'Engagement', icon: 'message-circle' },
    source_quality: { label: 'Source Quality', icon: 'star' },
    timeline_urgency: { label: 'Timeline Urgency', icon: 'clock' },
  };

  const MATCHING_LABELS_MAP: Record<string, { label: string; icon: string }> = {
    board: { label: 'School Board', icon: 'file-text' },
    class: { label: 'Class Level', icon: 'book' },
    facilities: { label: 'Campus Facilities', icon: 'home' },
    fees_range: { label: 'Fees Range', icon: 'dollar-sign' },
    gender: { label: 'Gender Type', icon: 'users' },
    ranking: { label: 'School Rank', icon: 'award' },
    school_type: { label: 'Boarding Type', icon: 'building' },
    state: { label: 'State Location', icon: 'map-pin' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Executive Settings Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 22px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CrmIcon name="settings" size={20} color="#2563EB" /> Enterprise Governance &amp; Algorithm Configuration
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>
            Fine-tune Lead Scoring (100%), School Recommendation Matching (100%), and Tax Governance in real time.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            className="badge badge-success"
            style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <CrmIcon name="check" size={13} /> Algorithms Active &amp; Synced
          </span>
        </div>
      </div>

      {/* Feature 1 & Feature 2: Strict Total = 100 Weight Configurators */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Feature 1: Lead Scoring Weights */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div
              className="card-header"
              style={{ paddingBottom: '12px', borderBottom: '1px solid #F1F5F9', marginBottom: '14px' }}
            >
              <div>
                <h3 className="card-title" style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CrmIcon name="target" size={17} color="#2563EB" /> Feature 1: Lead Scoring Weights (5 Factors)
                </h3>
                <span className="card-subtitle" style={{ fontSize: '11.5px', color: '#64748B' }}>
                  Dynamic scoring distribution (Must sum to exactly 100%)
                </span>
              </div>
              <span
                className={`badge ${scoringTotal === 100 ? 'badge-success' : 'badge-danger'}`}
                style={{ fontSize: '12.5px', fontWeight: 700, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                Total: {scoringTotal}% {scoringTotal === 100 ? <CrmIcon name="check" size={14} /> : <CrmIcon name="x" size={14} />}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {Object.entries(scoringWeights).map(([k, v]) => {
                const conf = SCORING_LABELS_MAP[k] || { label: k, icon: 'target' };
                return (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <CrmIcon name={conf.icon} size={15} color="#2563EB" />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>{conf.label}</div>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>Weight</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="form-control"
                        style={{
                          width: '58px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '13px',
                          padding: '4px 6px',
                          background: '#ffffff',
                        }}
                        value={v}
                        onChange={(e) =>
                          setScoringWeights((prev) => ({ ...prev, [k]: Number(e.target.value || 0) }))
                        }
                      />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>%</span>
                    </div>
                  </div>
                );
              })}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: '#EFF6FF',
                  border: '1px dashed #93C5FD',
                  borderRadius: '8px',
                  color: '#1E40AF',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <CrmIcon name="zap" size={16} color="#2563EB" />
                <span>Auto-Recalculates all leads on save via BullMQ</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() =>
                setScoringWeights({
                  budget_match: 25,
                  engagement: 25,
                  source_quality: 20,
                  timeline_urgency: 15,
                  class_demand: 15,
                })
              }
            >
              Reset Defaults
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, padding: '10px', fontWeight: 700 }}
              disabled={scoringTotal !== 100 || !hasRole(user?.role, 'SUPER_ADMIN')}
              onClick={handleSaveScoring}
            >
              Save Lead Scoring Weights ({scoringTotal === 100 ? 'Total: 100%' : `Invalid: ${scoringTotal}%`})
            </button>
          </div>
        </div>

        {/* Feature 2: School Matching Weights */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div
              className="card-header"
              style={{ paddingBottom: '12px', borderBottom: '1px solid #F1F5F9', marginBottom: '14px' }}
            >
              <div>
                <h3 className="card-title" style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CrmIcon name="school" size={17} color="#2563EB" /> Feature 2: School Matching Weights (8 Criteria)
                </h3>
                <span className="card-subtitle" style={{ fontSize: '11.5px', color: '#64748B' }}>
                  Auto-recommendation matching weights (Must sum to exactly 100%)
                </span>
              </div>
              <span
                className={`badge ${matchingTotal === 100 ? 'badge-success' : 'badge-danger'}`}
                style={{ fontSize: '12.5px', fontWeight: 700, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                Total: {matchingTotal}% {matchingTotal === 100 ? <CrmIcon name="check" size={14} /> : <CrmIcon name="x" size={14} />}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {Object.entries(matchingWeights).map(([k, v]) => {
                const conf = MATCHING_LABELS_MAP[k] || { label: k, icon: 'school' };
                return (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <CrmIcon name={conf.icon} size={15} color="#2563EB" />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>{conf.label}</div>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>Weight</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="form-control"
                        style={{
                          width: '58px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '13px',
                          padding: '4px 6px',
                          background: '#ffffff',
                        }}
                        value={v}
                        onChange={(e) =>
                          setMatchingWeights((prev) => ({ ...prev, [k]: Number(e.target.value || 0) }))
                        }
                      />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() =>
                setMatchingWeights({
                  class: 15,
                  board: 15,
                  fees_range: 15,
                  state: 10,
                  gender: 15,
                  school_type: 10,
                  facilities: 10,
                  ranking: 10,
                })
              }
            >
              Reset Defaults
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={testingMatch}
              onClick={handleTestMatchingPreview}
            >
              {testingMatch ? 'Testing...' : 'Test Matching Preview'}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, padding: '10px', fontWeight: 700 }}
              disabled={matchingTotal !== 100 || !hasRole(user?.role, 'SUPER_ADMIN')}
              onClick={handleSaveMatching}
            >
              Save Matching Criteria ({matchingTotal === 100 ? 'Total: 100%' : `Invalid: ${matchingTotal}%`})
            </button>
          </div>
          {matchingPreviewList.length > 0 && (
            <div style={{ marginTop: '12px', padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px' }}>
              <strong style={{ color: '#0F172A' }}>Sample Matching Preview (CBSE • Dehradun • Class 8 • ₹6L):</strong>
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {matchingPreviewList.map((s: any, idx: number) => (
                  <div key={s.id || idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{idx + 1}. <strong>{s.name}</strong> ({s.board}, {s.city})</span>
                    <span className="badge badge-success">{Math.round(Number(s.matchScore ?? s.match_score ?? 0))}% Match</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GST/TDS, Rate Limits & Lead Import */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title"><CrmIcon name="settings" size={16} /> System Controls, Tax Rates &amp; 2-Step Lead Import</h3>
          {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowLeadImport(true)}>
              <CrmIcon name="download" size={16} /> Bulk Import Leads (Preview → Confirm)
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
            <label className="form-label">Lead Creation / Hour (Default: 50)</label>
            <input
              type="number"
              min={1}
              className="form-control"
              value={rateLimits.lead_create_per_hour}
              onChange={(e) =>
                setRateLimits((r) => ({ ...r, lead_create_per_hour: Math.max(1, Number(e.target.value || 1)) }))
              }
            />
          </div>
          <div>
            <label className="form-label">Lead Merge / Hour (Default: 10)</label>
            <input
              type="number"
              min={1}
              className="form-control"
              value={rateLimits.lead_merge_per_hour ?? 10}
              onChange={(e) =>
                setRateLimits((r) => ({ ...r, lead_merge_per_hour: Math.max(1, Number(e.target.value || 1)) }))
              }
            />
          </div>
          <div>
            <label className="form-label">Excel Import / Hour (Default: 2)</label>
            <input
              type="number"
              min={1}
              className="form-control"
              value={rateLimits.excel_import_per_hour ?? 2}
              onChange={(e) =>
                setRateLimits((r) => ({ ...r, excel_import_per_hour: Math.max(1, Number(e.target.value || 1)) }))
              }
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className="btn btn-success"
              disabled={!hasRole(user?.role, 'SUPER_ADMIN')}
              onClick={handleSaveFinanceAndLimits}
            >
              <CrmIcon name="save" size={16} /> Save Governance Settings
            </button>
          </div>
        </div>
      </div>

      {/* Background Jobs & Live Audit Log */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><CrmIcon name="clock" size={16} /> BullMQ Background Jobs ({jobs.length})</h3>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => handleTriggerJob('RECALCULATE_LEAD_SCORES')}
            >
              <CrmIcon name="zap" size={16} /> Recalculate All Scores
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
            <h3 className="card-title"><CrmIcon name="clipboard" size={16} /> Recent Centralized Audit Log</h3>
            <button className="btn btn-sm btn-outline" onClick={loadSettingsData}>
              <CrmIcon name="refresh" size={16} />
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
          <h3 className="card-title"><CrmIcon name="shield" size={16} /> Two-Factor Authentication (TOTP)</h3>
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
                <CrmIcon name="lock" size={16} /> Generate 2FA Secret &amp; QR
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
          <h3 className="card-title"><CrmIcon name="bell" size={16} /> Notification Preferences &amp; VAPID Push</h3>
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
              {pushSubscribed ? 'Unsubscribe Device Push' : 'Register This Device for Push'}
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
          <h3 className="card-title"><CrmIcon name="laptop" size={16} /> Active Device Sessions ({sessions.length})</h3>
          <span className="card-subtitle">
            Refresh-token family tracking with reuse detection and one-click remote sign-out
          </span>
        </div>
        <button className="btn btn-danger btn-sm" onClick={handleRevokeAll}>
          <CrmIcon name="logout" size={16} /> Revoke All Other Sessions
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
