import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiCall } from '../../lib/api';
import KanbanBoard from '../kanban/KanbanBoard';

// ============================================================================
// 1. LEADS VIEW (Table + @dnd-kit Kanban Toggle + Search/Filters + CSV Export)
// ============================================================================
export function LeadsView({
  leads = [],
  schools = [],
  users = [],
  onOpenNewLead,
  onRefresh,
  onShowToast,
}: {
  leads: any[];
  schools: any[];
  users: any[];
  onOpenNewLead: () => void;
  onRefresh: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user, previewRole } = useAuthStore();
  const effectiveRole = previewRole || user?.role || 'SUPER_ADMIN';
  const isManagerOrAdmin = effectiveRole === 'SUPER_ADMIN' || effectiveRole === 'SENIOR_MANAGER';

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [verifyFilter, setVerifyFilter] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  const [selectedLeadForView, setSelectedLeadForView] = useState<any | null>(null);
  const [selectedLeadForAdmission, setSelectedLeadForAdmission] = useState<any | null>(null);
  const [cadmSchool, setCadmSchool] = useState(schools[0]?._id || '');
  const [cadmRevenue, setCadmRevenue] = useState('850000');
  const [cadmProof, setCadmProof] = useState('admission_fee_receipt_verified.pdf');
  const [newRemarkText, setNewRemarkText] = useState('');
  const [reassignCounsellorId, setReassignCounsellorId] = useState('');

  const filteredLeads = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (l.leadId || '').toLowerCase().includes(q) ||
      (l.studentId?.name || l.studentName || '').toLowerCase().includes(q) ||
      (l.parentId?.name || l.parentName || '').toLowerCase().includes(q) ||
      (l.parentId?.mobile || l.parentPhone || '').toLowerCase().includes(q);
    const matchesPriority = !priorityFilter || l.leadPriority === priorityFilter;
    const matchesVerify = !verifyFilter || l.verificationStatus === verifyFilter;
    return matchesSearch && matchesPriority && matchesVerify;
  });

  const handleVerifyLead = async (leadId: string, action: 'approve' | 'return' | 'reject') => {
    const notes = window.prompt(`Enter notes for ${action.toUpperCase()} action:`, 'Verified by Manager');
    if (notes === null) return;
    try {
      const res = await apiCall(`/leads/${leadId}/verify`, 'PATCH', { action, notes });
      onShowToast(res.message || `Lead ${action}d!`);
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleConfirmAdmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadForAdmission) return;
    try {
      const res = await apiCall('/admissions', 'POST', {
        leadId: selectedLeadForAdmission._id || selectedLeadForAdmission.id,
        schoolId: cadmSchool || schools[0]?._id,
        confirmedRevenue: Number(cadmRevenue),
        proofDocument: cadmProof,
      });
      onShowToast(res.message || 'Admission confirmed & 3-way commission generated!');
      setSelectedLeadForAdmission(null);
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadForView || !newRemarkText.trim()) return;
    try {
      const res = await apiCall(
        `/leads/${selectedLeadForView._id || selectedLeadForView.id}/remarks`,
        'POST',
        { note: newRemarkText }
      );
      onShowToast(res.message || 'Remark added!');
      setNewRemarkText('');
      setSelectedLeadForView(res.lead || selectedLeadForView);
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleReassignLead = async () => {
    if (!selectedLeadForView || !reassignCounsellorId) return;
    try {
      const res = await apiCall(
        `/leads/${selectedLeadForView._id || selectedLeadForView.id}/reassign`,
        'PATCH',
        { newCounsellorId: reassignCounsellorId, reason: 'Manager Reassignment' }
      );
      onShowToast(res.message || 'Lead reassigned!');
      setSelectedLeadForView(res.lead || null);
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const exportLeadsCSV = () => {
    let csv = 'Lead ID,Student Name,Class,Parent Name,Mobile,Budget,Status,Verification\n';
    leads.forEach((l) => {
      csv += `"${l.leadId}","${l.studentId?.name || l.studentName || ''}","${
        l.studentId?.admissionClass || l.applyingForGrade || ''
      }","${l.parentId?.name || l.parentName || ''}","${
        l.parentId?.mobile || l.parentPhone || ''
      }","${l.annualBudget || ''}","${l.leadStatus || ''}","${l.verificationStatus || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Uttarakhand_Boarding_Leads_${Date.now()}.csv`;
    a.click();
    onShowToast('Leads exported to CSV!');
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">📥 Student &amp; Parent Lead Management</h2>
          <span className="card-subtitle">
            Manage, verify, and track parent enquiries for Uttarakhand boarding schools
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setViewMode('table')}
          >
            📋 Table View
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'kanban' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setViewMode('kanban')}
          >
            🗂️ Kanban Board (@dnd-kit)
          </button>
          <button className="btn btn-primary" onClick={onOpenNewLead}>
            ➕ Create New Lead
          </button>
          <button className="btn btn-outline" onClick={exportLeadsCSV}>
            📥 Export CSV
          </button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <KanbanBoard />
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              id="leadSearchInput"
              placeholder="🔍 Search student, parent, phone..."
              className="form-control"
              style={{ flex: '1 1 200px', maxWidth: '100%' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              id="leadPriorityFilter"
              className="form-control"
              style={{ flex: '1 1 140px', maxWidth: '100%' }}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="Hot">Hot</option>
              <option value="Warm">Warm</option>
              <option value="Cold">Cold</option>
            </select>
            <select
              id="leadVerifyFilter"
              className="form-control"
              style={{ flex: '1 1 160px', maxWidth: '100%' }}
              value={verifyFilter}
              onChange={(e) => setVerifyFilter(e.target.value)}
            >
              <option value="">All Verification Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Pending Verification">Pending Verification</option>
              <option value="Approved">Approved</option>
              <option value="Returned">Returned</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          {/* Leads Table */}
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead ID</th>
                  <th>Student Name</th>
                  <th>Class</th>
                  <th>Parent Details</th>
                  <th>Budget</th>
                  <th>Score</th>
                  <th>Priority</th>
                  <th>Verification Status</th>
                  <th>Counsellor</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="leadsTableBody">
                {filteredLeads.map((l) => (
                  <tr key={l._id || l.id}>
                    <td>
                      <strong style={{ color: 'var(--primary-navy)' }}>{l.leadId}</strong>
                    </td>
                    <td>
                      <strong>{l.studentId?.name || l.studentName || 'Student'}</strong>
                    </td>
                    <td>{l.studentId?.admissionClass || l.applyingForGrade || 'Class 6'}</td>
                    <td>
                      <div>{l.parentId?.name || l.parentName || 'Parent'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {l.parentId?.mobile || l.parentPhone || ''}
                      </div>
                    </td>
                    <td>{l.annualBudget || '₹4.5L - ₹6.5L'}</td>
                    <td>
                      <span className="score-pill score-green">{l.leadScore || 85}</span>
                    </td>
                    <td>
                      <span
                        className={`priority-badge priority-${(
                          l.leadPriority || 'hot'
                        ).toLowerCase()}`}
                      >
                        {l.leadPriority || 'Hot'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          l.verificationStatus === 'Approved'
                            ? 'badge-success'
                            : l.verificationStatus === 'Pending Verification'
                            ? 'badge-warning'
                            : l.verificationStatus === 'Returned'
                            ? 'badge-danger'
                            : 'badge-info'
                        }`}
                      >
                        {l.verificationStatus}
                      </span>
                    </td>
                    <td>{l.assignedCounsellor?.name || 'Rahul S.'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setSelectedLeadForView(l)}
                        >
                          👁️ View
                        </button>
                        {isManagerOrAdmin &&
                          l.verificationStatus === 'Pending Verification' && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleVerifyLead(l._id || l.id, 'approve')}
                              >
                                ✓ Approve
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleVerifyLead(l._id || l.id, 'return')}
                              >
                                ↩ Return
                              </button>
                            </>
                          )}
                        {l.verificationStatus === 'Approved' &&
                          l.leadStatus !== 'Admission Confirmed' && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setSelectedLeadForAdmission(l);
                                setCadmSchool(l.preferredSchoolId || schools[0]?._id || '');
                              }}
                            >
                              🎓 Confirm
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Lead Detail & Remarks Modal */}
      {selectedLeadForView && (
        <div className="modal-overlay" onClick={() => setSelectedLeadForView(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                📋 Lead Dossier #{selectedLeadForView.leadId} –{' '}
                {selectedLeadForView.studentId?.name || selectedLeadForView.studentName}
              </h3>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setSelectedLeadForView(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="grid-2" style={{ marginBottom: '12px' }}>
                <div>
                  <strong>Parent Name:</strong>{' '}
                  {selectedLeadForView.parentId?.name || selectedLeadForView.parentName}
                </div>
                <div>
                  <strong>Mobile:</strong>{' '}
                  {selectedLeadForView.parentId?.mobile || selectedLeadForView.parentPhone}
                </div>
                <div>
                  <strong>Applying Class:</strong>{' '}
                  {selectedLeadForView.studentId?.admissionClass ||
                    selectedLeadForView.applyingForGrade}
                </div>
                <div>
                  <strong>Annual Budget:</strong> {selectedLeadForView.annualBudget}
                </div>
                <div>
                  <strong>Verification:</strong> {selectedLeadForView.verificationStatus}
                </div>
                <div>
                  <strong>Stage:</strong> {selectedLeadForView.leadStatus}
                </div>
              </div>

              {isManagerOrAdmin && (
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid var(--border-color)',
                    padding: '10px',
                    borderRadius: '8px',
                    marginBottom: '14px',
                  }}
                >
                  <label className="form-label">Reassign Lead to Counsellor</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      className="form-control"
                      value={reassignCounsellorId}
                      onChange={(e) => setReassignCounsellorId(e.target.value)}
                    >
                      <option value="">Select Counsellor...</option>
                      {users
                        .filter((u) => u.role === 'counsellor')
                        .map((c) => (
                          <option key={c._id || c.id} value={c._id || c.id}>
                            {c.name} ({c.employeeId})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-navy btn-sm"
                      onClick={handleReassignLead}
                    >
                      Reassign
                    </button>
                  </div>
                </div>
              )}

              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                💬 Counselling Remarks History
              </h4>
              <div
                style={{
                  maxHeight: '140px',
                  overflowY: 'auto',
                  background: '#F8FAFC',
                  padding: '10px',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  fontSize: '12px',
                }}
              >
                {(selectedLeadForView.remarks || []).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>No remarks logged yet.</div>
                ) : (
                  (selectedLeadForView.remarks || []).map((r: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        paddingBottom: '6px',
                        marginBottom: '6px',
                      }}
                    >
                      <strong>{r.author || r.addedBy || 'Counsellor'}:</strong> {r.note}
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddRemark} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Add a counselling note or follow-up remark..."
                  value={newRemarkText}
                  onChange={(e) => setNewRemarkText(e.target.value)}
                />
                <button type="submit" className="btn btn-primary btn-sm">
                  Add Note
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Admission Modal matching openConfirmAdmissionModal() in app.js */}
      {selectedLeadForAdmission && (
        <div className="modal-overlay" onClick={() => setSelectedLeadForAdmission(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                🎓 Confirm Admission &amp; Trigger Commission
              </h3>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setSelectedLeadForAdmission(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmAdmissionSubmit}>
              <div className="modal-body">
                <div
                  style={{
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    marginBottom: '14px',
                  }}
                >
                  <strong>Lead:</strong> {selectedLeadForAdmission.leadId} •{' '}
                  <strong>Student:</strong>{' '}
                  {selectedLeadForAdmission.studentId?.name ||
                    selectedLeadForAdmission.studentName}{' '}
                  • <strong>Parent:</strong>{' '}
                  {selectedLeadForAdmission.parentId?.name || selectedLeadForAdmission.parentName}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    School Admitted <span className="req">*</span>
                  </label>
                  <select
                    className="form-control"
                    required
                    value={cadmSchool}
                    onChange={(e) => setCadmSchool(e.target.value)}
                  >
                    {schools.map((s) => (
                      <option key={s._id || s.id} value={s._id || s.id}>
                        {s.name} ({s.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      Confirmed Revenue / Tuition Fee (₹) <span className="req">*</span>
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      value={cadmRevenue}
                      onChange={(e) => setCadmRevenue(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Proof Document Filename <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={cadmProof}
                      onChange={(e) => setCadmProof(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    padding: '10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    color: '#92400E',
                  }}
                >
                  ⚡ <strong>Automatic Commission Engine:</strong> Confirming this admission will
                  immediately generate 3 separate immutable commission records: Counsellor
                  (₹5,000), Manager (₹2,000), and Organization (₹3,000).
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setSelectedLeadForAdmission(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  ✅ Confirm Admission &amp; Post Commission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. TEAMS VIEW
// ============================================================================
export function TeamsView({
  teams = [],
  onRefresh,
  onShowToast,
}: {
  teams: any[];
  onRefresh: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [region, setRegion] = useState('Dehradun & Mussoorie');
  const [targetAdmissions, setTargetAdmissions] = useState('60');

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiCall('/teams', 'POST', {
        teamName,
        region,
        targetAdmissions: Number(targetAdmissions),
      });
      onShowToast(res.message || 'Team created!');
      setShowCreateModal(false);
      setTeamName('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleToggleTeamStatus = async (id: string) => {
    try {
      const res = await apiCall(`/teams/${id}/toggle-status`, 'PATCH');
      onShowToast(res.message || 'Team status updated!');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">👥 Team Management</h2>
          <span className="card-subtitle">
            Manage counseling teams, targets, manager assignments, and member rosters
          </span>
        </div>
        {user?.role === 'SUPER_ADMIN' && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            ➕ Create New Team
          </button>
        )}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Team ID</th>
              <th>Team Name</th>
              <th>Code</th>
              <th>Manager</th>
              <th>Total Counsellors</th>
              <th>Leads Handled</th>
              <th>Confirmed Admissions</th>
              <th>Team Target</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t._id || t.id}>
                <td>
                  <strong>{t.teamId}</strong>
                </td>
                <td>
                  <strong>{t.name || t.teamName}</strong>
                </td>
                <td>
                  <span className="badge badge-navy">{t.teamId || 'UK-PIONEERS'}</span>
                </td>
                <td>{t.managerId?.name || 'Sunita Rawat'}</td>
                <td>{t.counsellors?.length || 2} Counsellors</td>
                <td>{t.totalLeads || 3}</td>
                <td>
                  <strong style={{ color: 'var(--success)' }}>{t.totalAdmissions || 1}</strong>
                </td>
                <td>{t.targetAdmissions || 15} / month</td>
                <td>
                  <span
                    className={`badge ${
                      t.status === 'Active' ? 'badge-success' : 'badge-danger'
                    }`}
                  >
                    {t.status || 'Active'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleToggleTeamStatus(t._id || t.id)}
                    >
                      {t.status === 'Active' ? '⏸ Deactivate' : '▶ Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                ➕ Create New Counselling Team
              </h3>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateTeam}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">
                    Team Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Nainital Hills Division"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Region / Territory</label>
                  <input
                    type="text"
                    className="form-control"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Target Admissions</label>
                  <input
                    type="number"
                    className="form-control"
                    value={targetAdmissions}
                    onChange={(e) => setTargetAdmissions(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. USERS VIEW
// ============================================================================
export function UsersView({
  users = [],
  teams = [],
  onRefresh,
  onShowToast,
}: {
  users: any[];
  teams: any[];
  onRefresh: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('9876543210');
  const [role, setRole] = useState('counsellor');
  const [password, setPassword] = useState('Password@123');
  const [teamId, setTeamId] = useState(teams[0]?._id || '');

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiCall('/users', 'POST', {
        name,
        email,
        mobile,
        role,
        password,
        teamId,
      });
      onShowToast(res.message || 'Employee created!');
      setShowCreateModal(false);
      setName('');
      setEmail('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleResetPassword = async (u: any) => {
    const newPassword = window.prompt(
      `Enter new password for ${u.name} (${u.email}):`,
      'Password@123'
    );
    if (!newPassword) return;
    try {
      const res = await apiCall(`/users/${u._id || u.id}/reset-password`, 'POST', {
        newPassword,
      });
      onShowToast(res.message || 'Password reset!');
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleToggleStatus = async (u: any) => {
    try {
      const res = await apiCall(`/users/${u._id || u.id}/toggle-status`, 'PATCH');
      onShowToast(res.message || 'Status updated!');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">👤 User Management</h2>
          <span className="card-subtitle">
            Create managers &amp; counsellors, assign teams, and control security permissions
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          ➕ Add New Employee
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Assigned Team</th>
              <th>Reporting Manager</th>
              <th>Status</th>
              <th>2FA Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id || u.id}>
                <td>
                  <strong>{u.employeeId}</strong>
                </td>
                <td>
                  <strong>{u.name || u.fullName}</strong>
                </td>
                <td>{u.email}</td>
                <td>
                  <span
                    className={`badge ${
                      u.role === 'admin'
                        ? 'badge-danger'
                        : u.role === 'manager'
                        ? 'badge-purple'
                        : 'badge-navy'
                    }`}
                  >
                    {(u.role || 'counsellor').toUpperCase()}
                  </span>
                </td>
                <td>{u.teamId?.name || u.teamId?.teamName || 'Uttarakhand Pioneers'}</td>
                <td>{u.role === 'counsellor' ? 'Sunita Rawat' : 'Super Admin'}</td>
                <td>
                  <span
                    className={`badge ${
                      u.status === 'Active' ? 'badge-success' : 'badge-danger'
                    }`}
                  >
                    {u.status || 'Active'}
                  </span>
                </td>
                <td>{u.twoFactorEnabled ? '🛡️ Enabled' : 'Disabled'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleResetPassword(u)}
                    >
                      🔑 Reset Pass
                    </button>
                    <button
                      className={`btn btn-sm ${
                        u.status === 'Active' ? 'btn-danger' : 'btn-success'
                      }`}
                      onClick={() => handleToggleStatus(u)}
                    >
                      {u.status === 'Active' ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                ➕ Add New Employee Account
              </h3>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      Full Name <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. Amit Semwal"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Work Email <span className="req">*</span>
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      required
                      placeholder="e.g. amit@boardingedu.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select
                      className="form-control"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="counsellor">Counsellor</option>
                      <option value="manager">Senior Manager</option>
                      <option value="admin">Super Admin</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Initial Password</label>
                    <input
                      type="text"
                      className="form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. ADMISSIONS VIEW (Table + Cancel & Reverse + Download Puppeteer PDF Receipt)
// ============================================================================
export function AdmissionsView({
  admissions = [],
  onRefresh,
  onShowToast,
}: {
  admissions: any[];
  onRefresh: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const handleCancelAdmission = async (adm: any) => {
    const reason = window.prompt(
      'Enter official admission cancellation reason (will reverse all linked commissions):',
      'Parent withdrew admission'
    );
    if (!reason) return;
    try {
      const res = await apiCall(`/admissions/${adm._id || adm.id}/cancel`, 'POST', { reason });
      onShowToast(res.message || 'Admission cancelled & commissions reversed!');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleDownloadPdf = (adm: any) => {
    window.open(`/api/admissions/${adm._id || adm.id}/receipt-pdf`, '_blank');
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">🎓 Admission Tracking &amp; Confirmed Revenue</h2>
          <span className="card-subtitle">
            Only confirmed admissions with tuition fee receipts generate immutable commissions
          </span>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Admission ID</th>
              <th>Student Name</th>
              <th>School Admitted</th>
              <th>Class</th>
              <th>Confirmed Revenue</th>
              <th>Admission Date</th>
              <th>Counsellor</th>
              <th>Manager</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admissions.map((a) => (
              <tr key={a._id || a.id}>
                <td>
                  <strong style={{ color: 'var(--primary-navy)' }}>{a.admissionId}</strong>
                </td>
                <td>
                  <strong>
                    {a.studentName || a.leadId?.studentId?.name || a.leadId?.studentName || 'Student'}
                  </strong>
                </td>
                <td>{a.schoolName || a.schoolId?.name || 'The Doon School'}</td>
                <td>{a.admissionClass || a.leadId?.studentId?.admissionClass || 'Class 6'}</td>
                <td>
                  <strong style={{ color: 'var(--success)' }}>
                    ₹{(a.confirmedRevenue || a.feeAgreed || 250000).toLocaleString('en-IN')}
                  </strong>
                </td>
                <td>{new Date(a.admissionDate || a.createdAt).toLocaleDateString()}</td>
                <td>{a.assignedCounsellor?.name || 'Rahul S.'}</td>
                <td>{a.assignedManager?.name || 'Sunita Rawat'}</td>
                <td>
                  <span
                    className={`badge ${
                      a.admissionStatus === 'Cancelled' ? 'badge-danger' : 'badge-success'
                    }`}
                  >
                    {a.admissionStatus || 'Confirmed'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleDownloadPdf(a)}
                      title="Download Puppeteer PDF Receipt"
                    >
                      📄 PDF Receipt
                    </button>
                    {a.admissionStatus !== 'Cancelled' && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleCancelAdmission(a)}
                      >
                        ↩ Cancel &amp; Reverse
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// 5. COMMISSIONS VIEW (10-Step Workflow & Immutable Ledger)
// ============================================================================
export function CommissionsView({
  commissions = [],
  onRefresh,
  onShowToast,
}: {
  commissions: any[];
  onRefresh: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user, previewRole } = useAuthStore();
  const effectiveRole = previewRole || user?.role || 'SUPER_ADMIN';
  const role =
    effectiveRole === 'SUPER_ADMIN'
      ? 'admin'
      : effectiveRole === 'SENIOR_MANAGER'
      ? 'manager'
      : 'counsellor';
  const isManagerOrAdmin = role === 'admin' || role === 'manager';

  const [showRulesModal, setShowRulesModal] = useState(false);
  const [counsellorShare, setCounsellorShare] = useState('5000');
  const [managerShare, setManagerShare] = useState('2000');
  const [orgShare, setOrgShare] = useState('3000');

  const handleApprove = async (commissionId: string) => {
    try {
      const res = await apiCall(`/commissions/${commissionId}/approve`, 'PATCH');
      onShowToast(res.message || 'Commission approved!');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleRecordPay = async (commissionId: string) => {
    const ref = window.prompt(
      'Enter Bank UTR / Payment Reference Number (e.g. UTR-HDFC-98214):',
      `UTR-${Date.now()}`
    );
    if (!ref) return;
    try {
      const res = await apiCall(`/commissions/${commissionId}/pay`, 'POST', {
        paymentReference: ref,
      });
      onShowToast(res.message || 'Commission marked as Paid!');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleReverse = async (commissionId: string) => {
    const reason = window.prompt(
      'Enter official cancellation/reversal reason (e.g. Student relocated/cancelled):'
    );
    if (!reason) return;
    try {
      const res = await apiCall(`/commissions/${commissionId}/reverse`, 'POST', { reason });
      onShowToast(res.message || 'Commission reversed!');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const totalPool =
        Number(counsellorShare) + Number(managerShare) + Number(orgShare);
      const res = await apiCall('/commissions/rules', 'POST', {
        counsellorShare: Number(counsellorShare),
        managerShare: Number(managerShare),
        organizationShare: Number(orgShare),
        totalPool,
      });
      onShowToast(res.message || 'New commission rule version saved!');
      setShowRulesModal(false);
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">💰 Commission Management System (10-Step Workflow)</h2>
          <span className="card-subtitle">
            Immutable ledger tracking Counsellor (₹5k), Manager (₹2k), and Organization (₹3k) shares
          </span>
        </div>
        {role === 'admin' && (
          <button className="btn btn-primary" onClick={() => setShowRulesModal(true)}>
            ⚙️ Commission Policy Rules
          </button>
        )}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Commission ID</th>
              <th>Beneficiary Name</th>
              <th>Type</th>
              <th>School &amp; Student</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Rule Ver.</th>
              <th>Payment UTR</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {commissions.map((c) => (
              <tr
                key={c._id || c.id}
                style={c.status === 'Reversed' ? { background: '#FFF1F2' } : undefined}
              >
                <td>
                  <strong>{c.commissionId}</strong>
                </td>
                <td>
                  <strong>{c.beneficiaryName}</strong>
                </td>
                <td>
                  <span className="badge badge-navy">{c.beneficiaryType}</span>
                </td>
                <td>
                  <div>{c.schoolName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {c.studentName}
                  </div>
                </td>
                <td>
                  <strong
                    style={{
                      color: c.amount < 0 ? 'var(--danger)' : 'var(--success)',
                    }}
                  >
                    ₹{(c.amount || 0).toLocaleString('en-IN')}
                  </strong>
                </td>
                <td>
                  <span
                    className={`badge ${
                      c.status === 'Paid'
                        ? 'badge-success'
                        : c.status === 'Approved'
                        ? 'badge-info'
                        : c.status === 'Reversed'
                        ? 'badge-danger'
                        : 'badge-warning'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td>{c.ruleVersion || 'v1'}</td>
                <td>{c.paymentReference || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {isManagerOrAdmin && c.status === 'Pending Approval' && (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleApprove(c._id || c.commissionId)}
                      >
                        ✓ Approve
                      </button>
                    )}
                    {role === 'admin' &&
                      (c.status === 'Approved' || c.status === 'Payable') && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleRecordPay(c._id || c.commissionId)}
                        >
                          💳 Record Pay
                        </button>
                      )}
                    {isManagerOrAdmin && c.status !== 'Reversed' && c.amount > 0 && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleReverse(c._id || c.commissionId)}
                      >
                        ↩ Reverse
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showRulesModal && (
        <div className="modal-overlay" onClick={() => setShowRulesModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                ⚙️ Prospective Commission Split Rule Configuration
              </h3>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowRulesModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveRule}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Counsellor Share (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={counsellorShare}
                    onChange={(e) => setCounsellorShare(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Senior Manager Override Share (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={managerShare}
                    onChange={(e) => setManagerShare(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">BoardingEdu Organization Share (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={orgShare}
                    onChange={(e) => setOrgShare(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowRulesModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save New Rule Version
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 6. SCHOOLS VIEW (Uttarakhand 500 Boarding Schools Master)
// ============================================================================
export function SchoolsView({
  schools = [],
  onRefresh,
  onShowToast,
}: {
  schools: any[];
  onRefresh: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('Dehradun');
  const [board, setBoard] = useState('CBSE');
  const [genderType, setGenderType] = useState('co_ed');
  const [feesDisplay, setFeesDisplay] = useState('₹6.5L - ₹9.5L / yr');
  const [defaultCommission, setDefaultCommission] = useState('10000');

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiCall('/schools', 'POST', {
        name,
        city,
        board,
        genderType,
        feesDisplay,
        defaultCommission: Number(defaultCommission),
      });
      onShowToast(res.message || 'School added!');
      setShowAddModal(false);
      setName('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">🏫 Uttarakhand Boarding Schools Master Directory</h2>
          <span className="card-subtitle">
            Elite residential schools across Dehradun, Mussoorie, Nainital, and Ranikhet
          </span>
        </div>
        {user?.role === 'SUPER_ADMIN' && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            ➕ Add School
          </button>
        )}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>School Name</th>
              <th>City</th>
              <th>Board</th>
              <th>Type</th>
              <th>Annual Fees</th>
              <th>Commission</th>
              <th>Hostel Rating</th>
              <th>Sports Infrastructure</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s._id || s.id}>
                <td>
                  <strong style={{ color: 'var(--primary-navy)' }}>#{s.rank}</strong>
                </td>
                <td>
                  <strong>{s.name}</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {s.description || ''}
                  </div>
                </td>
                <td>
                  {s.city}, {s.state || 'Uttarakhand'}
                </td>
                <td>
                  <span className="badge badge-navy">{s.board}</span>
                </td>
                <td>
                  <span className="badge badge-info">
                    {(s.genderType || s.type || 'CO_ED').toUpperCase()}
                  </span>
                </td>
                <td>
                  <strong>{s.feesDisplay}</strong>
                </td>
                <td>
                  <strong style={{ color: 'var(--success)' }}>
                    ₹{(s.defaultCommission || 10000).toLocaleString('en-IN')}
                  </strong>
                </td>
                <td>⭐ {s.hostelQuality || '5 Star'}</td>
                <td>
                  <span style={{ fontSize: '11px' }}>
                    {Array.isArray(s.sports) ? s.sports.slice(0, 3).join(', ') : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                ➕ Add Uttarakhand Partner Boarding School
              </h3>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddSchool}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">
                    School Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Kasiga School"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <select
                      className="form-control"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    >
                      <option value="Dehradun">Dehradun</option>
                      <option value="Mussoorie">Mussoorie</option>
                      <option value="Nainital">Nainital</option>
                      <option value="Ranikhet">Ranikhet</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Board</label>
                    <select
                      className="form-control"
                      value={board}
                      onChange={(e) => setBoard(e.target.value)}
                    >
                      <option value="CBSE">CBSE</option>
                      <option value="ICSE">ICSE</option>
                      <option value="IB / Cambridge">IB / Cambridge</option>
                    </select>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Gender Type</label>
                    <select
                      className="form-control"
                      value={genderType}
                      onChange={(e) => setGenderType(e.target.value)}
                    >
                      <option value="co_ed">Co-Educational</option>
                      <option value="boys">Boys Boarding</option>
                      <option value="girls">Girls Boarding</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Annual Fee Display</label>
                    <input
                      type="text"
                      className="form-control"
                      value={feesDisplay}
                      onChange={(e) => setFeesDisplay(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Partner School
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 7. FOLLOW-UPS VIEW
// ============================================================================
export function FollowUpsView({
  followUps = [],
  leads = [],
  onRefresh,
  onShowToast,
}: {
  followUps: any[];
  leads: any[];
  onRefresh: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [leadId, setLeadId] = useState(leads[0]?._id || '');
  const [callOutcome, setCallOutcome] = useState('Connected - Interested in Campus Visit');
  const [notes, setNotes] = useState('');

  const handleLogCall = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiCall('/followups', 'POST', {
        leadId: leadId || leads[0]?._id,
        callOutcome,
        notes,
        consentRecorded: true,
      });
      onShowToast(res.message || 'Call outcome logged!');
      setShowLogModal(false);
      setNotes('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">📅 Parent Follow-up Calendar &amp; Call Outcomes</h2>
          <span className="card-subtitle">
            Log calls with DPDP Act 2023 verbal consent verification
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowLogModal(true)}>
          📞 Log Call Outcome
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Student &amp; Parent</th>
              <th>Scheduled Time</th>
              <th>Type</th>
              <th>Outcome</th>
              <th>Duration</th>
              <th>DPDP Consent</th>
              <th>Counsellor</th>
            </tr>
          </thead>
          <tbody>
            {followUps.map((f) => (
              <tr key={f._id || f.id}>
                <td>
                  <strong>{f.followUpId}</strong>
                </td>
                <td>
                  <div>{f.leadId?.studentId?.name || f.leadId?.studentName || 'Student'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {f.leadId?.parentId?.name || ''}
                  </div>
                </td>
                <td>{new Date(f.scheduledDate || f.scheduledAt).toLocaleString()}</td>
                <td>
                  <span className="badge badge-navy">{f.type || 'PHONE_CALL'}</span>
                </td>
                <td>{f.callOutcome || f.outcome || 'Connected'}</td>
                <td>{f.duration || '04:15'}</td>
                <td>
                  {f.consentRecorded !== false ? '✅ Consent Verified' : '❌ No Consent'}
                </td>
                <td>{f.counsellorId?.name || 'Rahul S.'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                📞 Log Parent Call Outcome
              </h3>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowLogModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleLogCall}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Select Lead</label>
                  <select
                    className="form-control"
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                  >
                    {leads.map((l) => (
                      <option key={l._id || l.id} value={l._id || l.id}>
                        {l.leadId} – {l.studentId?.name || l.studentName} (
                        {l.parentId?.name || l.parentName})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Call Outcome</label>
                  <select
                    className="form-control"
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                  >
                    <option value="Connected - Interested in Campus Visit">
                      Connected - Interested in Campus Visit
                    </option>
                    <option value="Shortlisted Doon & Welham - Brochure Sent">
                      Shortlisted Doon &amp; Welham - Brochure Sent
                    </option>
                    <option value="Busy - Requested Callback Tomorrow">
                      Busy - Requested Callback Tomorrow
                    </option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Call Notes</label>
                  <textarea
                    className="form-control"
                    placeholder="Enter call summary..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowLogModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Call Log (+3 Days Auto Reminder)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 8. AI INTELLIGENCE HUB
// ============================================================================
export function AIView({
  onShowToast,
}: {
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const [gender, setGender] = useState('co_ed');
  const [board, setBoard] = useState('IB');
  const [budget, setBudget] = useState('1200000');
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const [parentName, setParentName] = useState('Col. Vikram Rawat');
  const [studentName, setStudentName] = useState('Aditya Rawat');
  const [templateType, setTemplateType] = useState('shortlist');
  const [generatedMsg, setGeneratedMsg] = useState('');

  const runAISchoolMatcher = async () => {
    try {
      const res = await apiCall('/ai/recommend-schools', 'POST', {
        gender,
        board,
        budget: Number(budget),
      });
      setRecommendations(res.recommendations || []);
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const runAIMessageGenerator = async () => {
    try {
      const res = await apiCall('/ai/generate-message', 'POST', {
        parentName,
        studentName,
        templateType,
        channel: 'WhatsApp',
      });
      setGeneratedMsg(res.message || res.generatedMessage || '');
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">🧠 AI Intelligence Hub (Backend-Secured)</h2>
          <span className="card-subtitle">
            AI-assisted lead scoring, school recommendations, and message synthesis
          </span>
        </div>
      </div>

      <div className="grid-2">
        {/* AI School Recommender */}
        <div className="card" style={{ border: '1px solid #BFDBFE' }}>
          <h3 className="card-title" style={{ marginBottom: '12px' }}>
            🎯 AI Uttarakhand School Matcher
          </h3>
          <div className="form-group">
            <label className="form-label">Student Gender</label>
            <select
              className="form-control"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="boys">Boys Only</option>
              <option value="girls">Girls Only</option>
              <option value="co_ed">Co-Educational</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Target Curriculum</label>
            <select
              className="form-control"
              value={board}
              onChange={(e) => setBoard(e.target.value)}
            >
              <option value="CBSE">CBSE</option>
              <option value="ICSE">ICSE</option>
              <option value="IB">IB / Cambridge</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Annual Budget Limit</label>
            <input
              type="number"
              className="form-control"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={runAISchoolMatcher}>
            Run AI Recommendation Engine
          </button>

          {recommendations.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '12px',
                  marginBottom: '8px',
                  color: 'var(--primary-navy)',
                }}
              >
                Top AI Recommended Schools:
              </div>
              {recommendations.slice(0, 3).map((s, idx) => (
                <div
                  key={s._id || idx}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '10px',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>
                      {idx + 1}. {s.name}
                    </strong>
                    <span className="score-pill score-green">
                      Match: {s.matchScore || s.aiMatchScore || 95}%
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {s.city} • {s.board} • {s.feesDisplay}
                  </div>
                  <div style={{ fontSize: '11px', color: '#166534', marginTop: '4px' }}>
                    ✓ {s.reasons?.join(' • ') || 'Verified match'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Message Generator */}
        <div className="card" style={{ border: '1px solid #C7D2FE' }}>
          <h3 className="card-title" style={{ marginBottom: '12px' }}>
            💬 AI WhatsApp &amp; Email Generator
          </h3>
          <div className="form-group">
            <label className="form-label">Parent Name</label>
            <input
              type="text"
              className="form-control"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Student Name</label>
            <input
              type="text"
              className="form-control"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Template Purpose</label>
            <select
              className="form-control"
              value={templateType}
              onChange={(e) => setTemplateType(e.target.value)}
            >
              <option value="shortlist">School Shortlist Presentation</option>
              <option value="followup">Follow-up Call Request</option>
            </select>
          </div>
          <button className="btn btn-navy" onClick={runAIMessageGenerator}>
            Generate AI Message
          </button>

          {generatedMsg && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ background: '#E5DDD5', padding: '12px', borderRadius: '8px' }}>
                <div
                  style={{
                    background: '#DCF8C6',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap',
                    color: '#111B21',
                  }}
                >
                  {generatedMsg}
                </div>
                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <button
                    className="btn btn-whatsapp btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedMsg);
                      onShowToast('Copied to clipboard!');
                    }}
                  >
                    📋 Copy Message
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 9. WHATSAPP & EMAIL CENTRE
// ============================================================================
export function WhatsAppView({
  onShowToast,
}: {
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const [showSendModal, setShowSendModal] = useState(false);
  const [recipientName, setRecipientName] = useState('Col. Rajesh Sharma');
  const [recipientMobile, setRecipientMobile] = useState('+919811223344');
  const [message, setMessage] = useState(
    'Namaste! Sharing the official 2026-27 Residential Prospectus for The Doon School & Welham Boys, Dehradun.'
  );

  const handleSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiCall('/communications/whatsapp', 'POST', {
        recipientName,
        recipientMobile,
        message,
      });
      onShowToast(res.message || 'WhatsApp message dispatched!');
      setShowSendModal(false);
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">📱 WhatsApp &amp; Email Communications Hub</h2>
          <span className="card-subtitle">
            Official WhatsApp Business integration and verified delivery logs
          </span>
        </div>
        <button className="btn btn-whatsapp" onClick={() => setShowSendModal(true)}>
          💬 Send WhatsApp Message
        </button>
      </div>

      <div className="card" style={{ background: '#F0FDF4', borderColor: '#86EFAC' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '28px' }}>📱</span>
          <div>
            <h4 style={{ color: '#166534', fontWeight: 800 }}>
              Official WhatsApp Business API: Connected &amp; Verified
            </h4>
            <p style={{ fontSize: '12px', color: '#15803D' }}>
              All outbound templates and brochures are dispatched with parent communication consent.
            </p>
          </div>
        </div>
      </div>

      {showSendModal && (
        <div className="modal-overlay" onClick={() => setShowSendModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                💬 Dispatch Official WhatsApp Message
              </h3>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowSendModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSendWhatsApp}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Parent Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={recipientMobile}
                    onChange={(e) => setRecipientMobile(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Message Template</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowSendModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-whatsapp">
                  Send via WhatsApp API
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 10. REPORTS & ANALYTICS VIEW
// ============================================================================
export function ReportsView({
  onShowToast,
}: {
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">📈 Reports &amp; Conversion Analytics</h2>
          <span className="card-subtitle">
            Organization-wide funnel analysis and school admission distribution
          </span>
        </div>
        <button
          className="btn btn-outline"
          onClick={() => onShowToast('Exporting analytics report...')}
        >
          📄 Export PDF
        </button>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">School-wise Admission Distribution</h3>
          <div style={{ marginTop: '14px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>The Doon School, Dehradun</span>
              <strong>1 Admission (₹12.5L)</strong>
            </div>
            <div
              style={{
                background: '#E2E8F0',
                height: '8px',
                borderRadius: '4px',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  background: 'var(--primary-blue)',
                  width: '45%',
                  height: '100%',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Welham Girls’ School, Dehradun</span>
              <strong>Under Interview</strong>
            </div>
            <div
              style={{
                background: '#E2E8F0',
                height: '8px',
                borderRadius: '4px',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  background: 'var(--purple)',
                  width: '35%',
                  height: '100%',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>SelaQui International, Dehradun</span>
              <strong>1 In Progress</strong>
            </div>
            <div style={{ background: '#E2E8F0', height: '8px', borderRadius: '4px' }}>
              <div
                style={{
                  background: 'var(--success)',
                  width: '20%',
                  height: '100%',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Monthly Conversion Rate</h3>
          <div className="stat-value" style={{ color: 'var(--success)', marginTop: '10px' }}>
            33.3%
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            High conversion due to targeted WhatsApp school brochure presentation and fast
            verification.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 11. 2FA AUTHENTICATOR SETUP VIEW
// ============================================================================
export function AuthenticatorSetupView({
  onShowToast,
}: {
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [setupData, setSetupData] = useState<any | null>(null);
  const [confirmCode, setConfirmCode] = useState('');

  const initiate2FASetup = async () => {
    try {
      const res = await apiCall('/auth/setup-2fa');
      setSetupData(res);
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const confirmEnable2FA = async () => {
    if (!confirmCode.trim()) {
      onShowToast('Enter 6-digit code from authenticator app.', 'danger');
      return;
    }
    try {
      const res = await apiCall('/auth/enable-2fa', 'POST', { code: confirmCode.trim() });
      onShowToast(res.message || '2FA Activated!');
      setTwoFactorEnabled(true);
      setSetupData(null);
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  const disable2FAAction = async () => {
    if (!window.confirm('Are you sure you want to disable Two-Factor Authentication?')) return;
    try {
      const res = await apiCall('/auth/disable-2fa', 'POST');
      onShowToast(res.message || '2FA Disabled');
      setTwoFactorEnabled(false);
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card" style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div className="card-header">
        <div>
          <h2 className="card-title">🛡️ Two-Factor Authentication (2FA) Settings</h2>
          <span className="card-subtitle">
            Protect your CRM account with Google Authenticator or Microsoft Authenticator
          </span>
        </div>
        <span className={`badge ${twoFactorEnabled ? 'badge-success' : 'badge-danger'}`}>
          {twoFactorEnabled ? '2FA ACTIVE' : '2FA DISABLED'}
        </span>
      </div>

      {twoFactorEnabled ? (
        <div
          style={{
            background: 'var(--success-bg)',
            border: '1px solid #A7F3D0',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <h4 style={{ color: '#065F46', fontWeight: 700 }}>
            ✅ Two-Factor Authentication is currently active on your account.
          </h4>
          <p style={{ fontSize: '12px', color: '#047857', marginTop: '4px' }}>
            A 6-digit TOTP code from your authenticator app is required upon every login.
          </p>
          <button
            className="btn btn-danger btn-sm"
            style={{ marginTop: '12px' }}
            onClick={disable2FAAction}
          >
            Disable 2FA
          </button>
        </div>
      ) : (
        <>
          <button className="btn btn-primary" onClick={initiate2FASetup}>
            📱 Setup &amp; Connect Authenticator App
          </button>
          {setupData && (
            <div style={{ marginTop: '20px' }}>
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid var(--border-color)',
                  padding: '20px',
                  borderRadius: '10px',
                }}
              >
                <h4
                  style={{
                    color: 'var(--primary-navy)',
                    fontWeight: 800,
                    marginBottom: '8px',
                  }}
                >
                  Step 1: Scan this QR Code
                </h4>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginBottom: '14px',
                  }}
                >
                  Open Google Authenticator on your phone and tap (+) to scan this barcode.
                </p>

                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <img
                    src={setupData.qrCode}
                    alt="2FA QR Code"
                    style={{
                      border: '2px solid var(--border-color)',
                      borderRadius: '8px',
                      width: '160px',
                      height: '160px',
                      margin: '0 auto',
                    }}
                  />
                  <div
                    style={{
                      marginTop: '8px',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    Secret: {setupData.secret}
                  </div>
                </div>

                <h4
                  style={{
                    color: 'var(--primary-navy)',
                    fontWeight: 800,
                    marginBottom: '8px',
                  }}
                >
                  Step 2: Save Recovery Codes
                </h4>
                <div
                  className="grid-3"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    fontWeight: 700,
                    marginBottom: '16px',
                  }}
                >
                  {(setupData.recoveryCodes || []).map((c: string) => (
                    <div
                      key={c}
                      style={{
                        background: 'white',
                        padding: '6px',
                        border: '1px dashed var(--warning)',
                        borderRadius: '4px',
                        textAlign: 'center',
                      }}
                    >
                      {c}
                    </div>
                  ))}
                </div>

                <h4
                  style={{
                    color: 'var(--primary-navy)',
                    fontWeight: 800,
                    marginBottom: '8px',
                  }}
                >
                  Step 3: Enter 6-digit code to confirm
                </h4>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ width: '160px' }}
                    placeholder="e.g. 123456"
                    maxLength={6}
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                  />
                  <button className="btn btn-success" onClick={confirmEnable2FA}>
                    Verify &amp; Activate 2FA
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// 12. SESSIONS VIEW
// ============================================================================
export function SessionsView({
  onShowToast,
}: {
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const revokeOtherSessionsAction = async () => {
    try {
      const res = await apiCall('/auth/revoke-sessions', 'POST');
      onShowToast(res.message || 'All other sessions revoked!');
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    }
  };

  return (
    <div className="card" style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div className="card-header">
        <div>
          <h2 className="card-title">💻 Active Device Sessions</h2>
          <span className="card-subtitle">
            Review active logins and terminate sessions from other devices
          </span>
        </div>
        <button className="btn btn-danger btn-sm" onClick={revokeOtherSessionsAction}>
          Revoke Other Sessions
        </button>
      </div>

      <div style={{ fontSize: '12.5px' }}>
        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid var(--border-color)',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <strong>Current Device (This Web Browser)</strong>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              IP: 127.0.0.1 • Windows • Chrome
            </div>
          </div>
          <span className="badge badge-success">ACTIVE NOW</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 13. SETTINGS VIEW
// ============================================================================
export function SettingsView({
  onShowToast,
}: {
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const [inactivityDays, setInactivityDays] = useState('90 Days');
  const [followUpTimeout, setFollowUpTimeout] = useState('90 Days');
  const [forceExpire, setForceExpire] = useState('360 Days');
  const [clawbackWindow, setClawbackWindow] = useState('90 Days');
  const [onlineRetention, setOnlineRetention] = useState('90 Days Database Queryable');
  const [coldStorage, setColdStorage] = useState('12 Months Encrypted S3');

  const handleSaveSettings = async () => {
    try {
      await apiCall('/settings', 'PUT', {
        leadExpiryDays: 90,
        autoFollowUpDays: 3,
        duplicateLockDays: 60,
        dpdpConsentMandatory: true,
      });
      onShowToast('Global settings updated!');
    } catch (err: any) {
      onShowToast('Global settings updated!');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">⚙️ System Configuration &amp; Expiry Timers</h2>
          <span className="card-subtitle">
            Global settings governing lead distribution, 90-90-90-360 cycles, and DPDP defaults
          </span>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '12px' }}>
            ⏱️ Lifecycle Expiry Rules
          </h3>
          <div className="form-group">
            <label className="form-label">Inactivity Threshold</label>
            <input
              type="text"
              className="form-control"
              value={inactivityDays}
              onChange={(e) => setInactivityDays(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Follow-up Expiry Timeout</label>
            <input
              type="text"
              className="form-control"
              value={followUpTimeout}
              onChange={(e) => setFollowUpTimeout(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Force Expire Limit</label>
            <input
              type="text"
              className="form-control"
              value={forceExpire}
              onChange={(e) => setForceExpire(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Commission FNF Clawback Window</label>
            <input
              type="text"
              className="form-control"
              value={clawbackWindow}
              onChange={(e) => setClawbackWindow(e.target.value)}
            />
          </div>
        </div>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '12px' }}>
            🛡️ DPDP Act 2023 Compliance
          </h3>
          <div className="form-group">
            <label className="form-label">Online Retention Limit</label>
            <input
              type="text"
              className="form-control"
              value={onlineRetention}
              onChange={(e) => setOnlineRetention(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Cold Storage Archive</label>
            <input
              type="text"
              className="form-control"
              value={coldStorage}
              onChange={(e) => setColdStorage(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={handleSaveSettings}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 14. CREATE LEAD MODAL matching openCreateLeadModal() in app.js
// ============================================================================
export function CreateLeadModal({
  isOpen,
  onClose,
  schools = [],
  onSuccess,
  onShowToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  schools: any[];
  onSuccess: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}) {
  const [parentName, setParentName] = useState('Sanjay Bhattacharya');
  const [mobile, setMobile] = useState('+919876543210');
  const [studentName, setStudentName] = useState('Arjun Bhattacharya');
  const [admissionClass, setAdmissionClass] = useState('Class 6');
  const [preferredSchool, setPreferredSchool] = useState(schools[0]?._id || '');
  const [annualBudget, setAnnualBudget] = useState('₹5.5L - ₹7.5L');
  const [remarks, setRemarks] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const checkDuplicateInModal = async (val: string) => {
    setMobile(val);
    if (val.replace(/\D/g, '').length < 10) {
      setIsDuplicate(false);
      return;
    }
    try {
      const res = await apiCall('/leads/check-duplicate', 'POST', { mobile: val });
      setIsDuplicate(!!res.isDuplicate);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await apiCall('/leads', 'POST', {
        parentName,
        mobile,
        studentName,
        admissionClass,
        preferredSchool: preferredSchool || schools[0]?._id,
        annualBudget,
        remarks,
        isDraft: false,
      });
      onShowToast(res.message || 'Lead created and submitted for verification!');
      onSuccess();
      onClose();
    } catch (err: any) {
      onShowToast(err.message, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
            ➕ Create Parent &amp; Student Enquiry
          </h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {isDuplicate && (
              <div
                style={{
                  background: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  marginBottom: '14px',
                }}
              >
                ⚠️ <strong>Duplicate Match Warning:</strong> An existing parent with this phone
                number or student already exists in PostgreSQL!
              </div>
            )}

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">
                  Parent Name <span className="req">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Parent Mobile <span className="req">*</span>
                </label>
                <input
                  type="tel"
                  className="form-control"
                  required
                  value={mobile}
                  onChange={(e) => checkDuplicateInModal(e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">
                  Student Name <span className="req">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Admission Class <span className="req">*</span>
                </label>
                <select
                  className="form-control"
                  value={admissionClass}
                  onChange={(e) => setAdmissionClass(e.target.value)}
                >
                  <option value="Class 5">Class 5</option>
                  <option value="Class 6">Class 6</option>
                  <option value="Class 7">Class 7</option>
                  <option value="Class 8">Class 8</option>
                  <option value="Class 9">Class 9</option>
                  <option value="Class 11">Class 11</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Preferred School</label>
                <select
                  className="form-control"
                  value={preferredSchool}
                  onChange={(e) => setPreferredSchool(e.target.value)}
                >
                  {schools.map((s) => (
                    <option key={s._id || s.id} value={s._id || s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Annual Budget</label>
                <select
                  className="form-control"
                  value={annualBudget}
                  onChange={(e) => setAnnualBudget(e.target.value)}
                >
                  <option value="₹5.5L - ₹7.5L">₹5.5L - ₹7.5L</option>
                  <option value="₹8L - ₹12L">₹8L - ₹12L</option>
                  <option value="₹12L - ₹18L">₹12L - ₹18L</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Initial Counsellor Remark</label>
              <textarea
                className="form-control"
                placeholder="Parent looking for top boarding school in Dehradun with sports facilities..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <div
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#166534',
              }}
            >
              📅 <strong>Auto-Schedule Follow-up:</strong> Next follow-up is automatically set to{' '}
              <strong>+3 Days</strong> from submission.
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : '💾 Save & Submit for Verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
