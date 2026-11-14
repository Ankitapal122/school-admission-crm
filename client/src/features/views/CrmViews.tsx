import React, { useEffect, useState } from 'react';
import { apiCall } from '../../lib/api';

export { LeadsView, CreateLeadModal } from './LeadsWorkspaceView';
export { CommissionsView, AdmissionsView, SchoolsView, BulkImportModal } from './FinanceAndSchoolsView';
export {
  ReportsView,
  UsersView,
  SettingsView,
  AuthenticatorSetupView,
  SessionsView,
} from './EnterpriseAdminAndReportsView';

export function TeamsView({
  teams = [],
  onRefresh,
  onShowToast,
}: {
  teams: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [region, setRegion] = useState('Uttarakhand');

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiCall('/teams', 'POST', { name: teamName.trim(), region: region.trim() });
      onShowToast('Team created cleanly!', 'success');
      setShowCreate(false);
      setTeamName('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Team creation failed.', 'danger');
    }
  };

  const handleToggleTeam = async (id: string) => {
    try {
      await apiCall(`/teams/${id}/toggle-status`, 'PATCH', {});
      onShowToast('Team status updated.', 'success');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to toggle team.', 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">👥 Team Structure &amp; Hierarchies ({teams.length})</h3>
          <span className="card-subtitle">Manage Counsellor &amp; Manager regional pods</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
          ➕ Create Team
        </button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Team Name</th>
              <th>Region</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {teams.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                  No teams configured yet.
                </td>
              </tr>
            ) : (
              teams.map((t: any) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                  </td>
                  <td>{t.region || 'Uttarakhand'}</td>
                  <td>
                    <span className={`badge ${t.isActive !== false ? 'badge-success' : 'badge-warning'}`}>
                      {t.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleToggleTeam(t.id)}
                    >
                      ⏯️ Toggle Status
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>➕ Create Regional Team</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowCreate(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateTeam}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Team Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Region</label>
                  <input
                    type="text"
                    className="form-control"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function FollowUpsView({
  followUps = [],
  leads = [],
  onRefresh,
  onShowToast,
}: {
  followUps: any[];
  leads: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [bucket, setBucket] = useState<'all' | 'today' | 'overdue'>('today');
  const [bucketItems, setBucketItems] = useState<any[]>([]);
  const [reschedLead, setReschedLead] = useState<any | null>(null);
  const [newDate, setNewDate] = useState(
    new Date(Date.now() + 86_400_000).toISOString().split('T')[0]
  );
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (bucket === 'today' || bucket === 'overdue') {
      apiCall(`/follow-ups/${bucket}`)
        .then((res) => {
          const list = res?.followUps || res?.leads || res?.items || res?.data || [];
          setBucketItems(Array.isArray(list) ? list : []);
        })
        .catch(() => setBucketItems([]));
    } else {
      setBucketItems(followUps.length > 0 ? followUps : leads);
    }
  }, [bucket, followUps, leads]);

  const handleComplete = async (item: any) => {
    try {
      await apiCall(`/follow-ups/${item.id}/complete`, 'POST', {
        outcome: 'Completed from CRM calendar',
      });
      onShowToast('Follow-up marked complete!', 'success');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Completion failed.', 'danger');
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedLead || reason.trim().length < 5) {
      onShowToast('Reason (min 5 chars) is mandatory for follow-up reschedule.', 'warning');
      return;
    }
    try {
      await apiCall(`/leads/${reschedLead.leadId || reschedLead.id}/follow-up`, 'PUT', {
        nextFollowUpDate: newDate,
        reason: reason.trim(),
      });
      onShowToast('Follow-up date updated & audited!', 'success');
      setReschedLead(null);
      setReason('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Reschedule failed.', 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">📅 Follow-up Calendar &amp; Overdue SLA</h3>
          <span className="card-subtitle">Mandatory-reason follow-up rescheduling &amp; completion tracking</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`btn btn-sm ${bucket === 'today' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setBucket('today')}
          >
            Today Due
          </button>
          <button
            className={`btn btn-sm ${bucket === 'overdue' ? 'btn-danger' : 'btn-outline'}`}
            onClick={() => setBucket('overdue')}
          >
            Overdue
          </button>
          <button
            className={`btn btn-sm ${bucket === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setBucket('all')}
          >
            All ({followUps.length || leads.length})
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Student / Lead</th>
              <th>Parent Mobile</th>
              <th>Next Follow-up</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bucketItems.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                  No follow-ups in "{bucket}" queue.
                </td>
              </tr>
            ) : (
              bucketItems.map((item: any, i: number) => (
                <tr key={item.id || i}>
                  <td>
                    <strong>{item.studentName || item.lead?.studentName || 'Lead'}</strong>
                  </td>
                  <td>{item.fatherPhone || item.mobile || item.lead?.fatherPhone || 'N/A'}</td>
                  <td>
                    {item.nextFollowUpDate || item.scheduledAt
                      ? new Date(item.nextFollowUpDate || item.scheduledAt).toLocaleDateString()
                      : 'Unscheduled'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => setReschedLead(item)}
                      >
                        📅 Reschedule
                      </button>
                      {item.scheduledAt && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleComplete(item)}
                        >
                          ✓ Complete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {reschedLead && (
        <div className="modal-overlay" onClick={() => setReschedLead(null)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>📅 Reschedule Follow-up</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setReschedLead(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleReschedule}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Date</label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mandatory Reason (min 5 chars) *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setReschedLead(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Reschedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function AIView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [board, setBoard] = useState('CBSE');
  const [city, setCity] = useState('Dehradun');
  const [budget, setBudget] = useState('800000');
  const [admissionClass, setAdmissionClass] = useState('Class 8');
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRunMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiCall('/match/suggest', 'POST', {
        preferredBoard: board,
        preferredLocation: city,
        budgetMax: Number(budget || 800000),
        admissionClass,
        topN: 10,
      });
      const list = res?.matches || res?.schools || res?.data?.matches || res?.data || [];
      setMatches(Array.isArray(list) ? list : []);
      onShowToast(`Matched ${Array.isArray(list) ? list.length : 0} partner schools cleanly.`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Match simulator failed.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">🧠 8-Criteria School Matching &amp; AI Simulator</h3>
          <span className="card-subtitle">
            Powered by live matching_criteria_weights (=100) from PostgreSQL
          </span>
        </div>
      </div>

      <form
        onSubmit={handleRunMatch}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        <div>
          <label className="form-label">Board</label>
          <select className="form-control" value={board} onChange={(e) => setBoard(e.target.value)}>
            <option value="CBSE">CBSE</option>
            <option value="ICSE">ICSE</option>
            <option value="IB">IB</option>
          </select>
        </div>
        <div>
          <label className="form-label">Location</label>
          <input
            type="text"
            className="form-control"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Max Budget (₹)</label>
          <input
            type="number"
            className="form-control"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Class</label>
          <input
            type="text"
            className="form-control"
            value={admissionClass}
            onChange={(e) => setAdmissionClass(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Scoring...' : '✨ Run Match'}
          </button>
        </div>
      </form>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>School</th>
              <th>Board &amp; City</th>
              <th>Annual Fee</th>
              <th>Weighted Match Score</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m: any, idx: number) => (
              <tr key={m.school?.id || m.id || idx}>
                <td>
                  <strong>{m.school?.name || m.name}</strong>
                </td>
                <td>
                  {m.school?.board || m.board} &bull; {m.school?.city || m.city}
                </td>
                <td>
                  ₹{Number(m.school?.annualFeeMin || m.annualFeeMin || 0).toLocaleString('en-IN')} - ₹
                  {Number(m.school?.annualFeeMax || m.annualFeeMax || 0).toLocaleString('en-IN')}
                </td>
                <td>
                  <span className="badge badge-success">
                    {Math.round(Number(m.matchScore ?? m.score ?? 0))}% Match
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WhatsAppView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplBody, setTplBody] = useState(
    'Namaste {parentName}! Sharing {schoolName} boarding details for {studentName}.'
  );

  const loadWaData = async () => {
    try {
      const [tRes, lRes] = await Promise.all([
        apiCall('/whatsapp-templates').catch(() => ({ templates: [] })),
        apiCall('/whatsapp/log').catch(() => ({ logs: [] })),
      ]);
      setTemplates(tRes?.templates || tRes?.data?.templates || []);
      setLogs(lRes?.logs || lRes?.items || lRes?.data || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadWaData();
  }, []);

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tplBody.length > 2000) {
      onShowToast('Template exceeds 2000 character limit.', 'warning');
      return;
    }
    try {
      await apiCall('/whatsapp-templates', 'POST', {
        name: tplName.trim(),
        category: 'admission_followup',
        content: tplBody.trim(),
      });
      onShowToast('WhatsApp template registered cleanly!', 'success');
      setShowNewTpl(false);
      setTplName('');
      loadWaData();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to save template.', 'danger');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">📱 WhatsApp Templates &amp; 3-Layer Activity Centre</h3>
            <span className="card-subtitle">
              Placeholder variables ({'{parentName}'}, {'{studentName}'}, {'{schoolName}'}) with strict 2000-char limit
            </span>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => setShowNewTpl(true)}>
            ➕ New Template
          </button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Template Name</th>
                <th>Body Preview</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t: any, i: number) => (
                <tr key={t.id || i}>
                  <td>
                    <strong>{t.name || t.title}</strong>
                  </td>
                  <td>{t.content || t.body || t.templateText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">📜 Recent Logged WhatsApp Dispatches ({logs.length})</h3>
        </div>
        <div style={{ maxHeight: '260px', overflowY: 'auto', fontSize: '12.5px' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#64748B' }}>No WhatsApp messages logged yet.</div>
          ) : (
            logs.slice(0, 20).map((lg: any, i: number) => (
              <div key={lg.id || i} style={{ padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                <strong>{lg.recipientPhone || lg.phone || 'Parent'}</strong> &bull;{' '}
                <span className="badge badge-success">{lg.status || 'sent'}</span>
                <div style={{ color: '#475569', marginTop: '2px' }}>{lg.message}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {showNewTpl && (
        <div className="modal-overlay" onClick={() => setShowNewTpl(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>➕ Create WhatsApp Template</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowNewTpl(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveTemplate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Template Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Message ({tplBody.length}/2000)</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    maxLength={2000}
                    required
                    value={tplBody}
                    onChange={(e) => setTplBody(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowNewTpl(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
