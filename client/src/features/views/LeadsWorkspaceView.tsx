import React, { useEffect, useMemo, useState } from 'react';
import { apiCall } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { BLUEPRINT_KANBAN_STAGES, hasRole } from '../../lib/roles';
import KanbanBoard from '../kanban/KanbanBoard';

export function LeadsView({
  leads = [],
  schools = [],
  users = [],
  onOpenNewLead,
  onRefresh,
  onShowToast,
}: {
  leads: any[];
  schools?: any[];
  users?: any[];
  onOpenNewLead: () => void;
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'expired' | 'suspended' | 'reopened' | 'merged'
  >('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredBucketLeads, setFilteredBucketLeads] = useState<any[] | null>(null);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState('');
  const [mergeSecondaryId, setMergeSecondaryId] = useState('');
  const [mergeReason, setMergeReason] = useState('');

  const [reasonModal, setReasonModal] = useState<{
    lead: any;
    action: 'delete' | 'restore' | 'reopen' | 'suspend' | 'expire' | 'force-expire' | 'disqualify';
    title: string;
    placeholder: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  // Fetch server-scoped bucket for expired/suspended/reopened tabs
  useEffect(() => {
    if (statusFilter === 'expired' || statusFilter === 'suspended' || statusFilter === 'reopened') {
      apiCall(`/leads/${statusFilter}`)
        .then((res) => {
          const list = res?.leads || res?.items || res?.data?.leads || res?.data || [];
          setFilteredBucketLeads(Array.isArray(list) ? list : []);
        })
        .catch(() => setFilteredBucketLeads(null));
    } else {
      setFilteredBucketLeads(null);
    }
  }, [statusFilter, leads]);

  const baseList = filteredBucketLeads ?? leads;
  const displayLeads = useMemo(() => {
    return baseList.filter((l: any) => {
      const st = String(l.status || '').toLowerCase();
      if (statusFilter === 'active' && (st === 'merged' || st === 'expired' || st === 'suspended')) {
        return false;
      }
      if (statusFilter === 'merged' && st !== 'merged') return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        String(l.studentName || '').toLowerCase().includes(q) ||
        String(l.leadNumber || '').toLowerCase().includes(q) ||
        String(l.fatherPhone || l.mobile || '').toLowerCase().includes(q) ||
        String(l.fatherName || l.parentName || '').toLowerCase().includes(q) ||
        String(l.city || '').toLowerCase().includes(q)
      );
    });
  }, [baseList, statusFilter, searchTerm]);

  const primaryLeadObj = leads.find((l) => l.id === mergePrimaryId);
  const secondaryLeadObj = leads.find((l) => l.id === mergeSecondaryId);

  const handleConfirmReasonAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonModal) return;
    const reason = actionReason.trim();
    if (!reason) {
      onShowToast('Please provide a reason for the audit log.', 'warning');
      return;
    }
    setBusyAction(true);
    try {
      const id = reasonModal.lead.id;
      if (reasonModal.action === 'delete') {
        await apiCall(`/leads/${id}`, 'DELETE', { reason });
        onShowToast(`Lead soft-deleted & audited cleanly.`, 'success');
      } else if (reasonModal.action === 'restore') {
        await apiCall(`/leads/${id}/restore`, 'POST', { reason });
        onShowToast(`Lead restored cleanly.`, 'success');
      } else if (reasonModal.action === 'reopen') {
        await apiCall(`/leads/${id}/reopen`, 'POST', { reason });
        onShowToast(`Lead reopened into active workflow.`, 'success');
      } else if (reasonModal.action === 'suspend') {
        await apiCall(`/leads/${id}/suspend`, 'POST', { reason });
        onShowToast(`Lead suspended (cycle timer paused).`, 'warning');
      } else if (reasonModal.action === 'expire') {
        await apiCall(`/leads/${id}/expire`, 'POST', { action: 'EXPIRE', reason, force: false });
        onShowToast(`Lead marked expired (soft — can still reopen).`, 'warning');
      } else if (reasonModal.action === 'force-expire') {
        await apiCall(`/leads/${id}/expire`, 'POST', { action: 'EXPIRE', reason, force: true });
        onShowToast(`Lead force-expired permanently (cannot reopen).`, 'danger');
      } else if (reasonModal.action === 'disqualify') {
        await apiCall(`/leads/${id}/disqualify`, 'POST', { reason });
        onShowToast(`Lead disqualified cleanly.`, 'warning');
      }
      setReasonModal(null);
      setActionReason('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Operation rejected.', 'danger');
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergePrimaryId || !mergeSecondaryId || mergePrimaryId === mergeSecondaryId) {
      onShowToast('Select two distinct leads to merge.', 'warning');
      return;
    }
    setBusyAction(true);
    try {
      await apiCall('/leads/merge', 'POST', {
        target_lead_id: mergePrimaryId,
        source_lead_id: mergeSecondaryId,
        reason: mergeReason.trim() || 'Confirmed duplicate student record merge',
      });
      onShowToast('Leads merged in a single ACID transaction (remarks, apps & commissions preserved).', 'success');
      setShowMergeModal(false);
      setMergePrimaryId('');
      setMergeSecondaryId('');
      setMergeReason('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Merge transaction failed.', 'danger');
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 className="card-title">📋 Student &amp; Parent Lead Management</h3>
            <span className="card-subtitle">
              Full lead dossier, 8-criteria school matching, 12-stage Kanban pipeline, ACID merge &amp; 90-90-90-360 lifecycle
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${viewMode === 'table' ? 'btn-navy' : 'btn-outline'}`}
              onClick={() => setViewMode('table')}
            >
              📄 Table View
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'kanban' ? 'btn-navy' : 'btn-outline'}`}
              onClick={() => setViewMode('kanban')}
            >
              🗂️ 12-Stage Kanban
            </button>
            {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
              <button
                className="btn btn-sm btn-warning"
                onClick={() => setShowMergeModal(true)}
              >
                🔀 ACID Merge Duplicates
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={onOpenNewLead}>
              ➕ Add Student Lead
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['all', 'active', 'expired', 'suspended', 'reopened', 'merged'] as const).map((tab) => (
              <button
                key={tab}
                className={`btn btn-sm ${statusFilter === tab ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setStatusFilter(tab)}
                style={{ textTransform: 'capitalize' }}
              >
                {tab}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="form-control"
            style={{ maxWidth: '280px' }}
            placeholder="Search student, LD ID, phone, city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {viewMode === 'kanban' ? (
          <KanbanBoard
            leads={displayLeads}
            onRefresh={onRefresh}
            onShowToast={onShowToast}
            onSelectLead={(lead) => setSelectedLead(lead)}
          />
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead ID</th>
                  <th>Student &amp; Class</th>
                  <th>Parent Contact</th>
                  <th>Stage &amp; Score</th>
                  <th>Status / Cycle</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#64748B', padding: '24px' }}>
                      No leads found in "{statusFilter}" view.
                    </td>
                  </tr>
                ) : (
                  displayLeads.map((l: any) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.leadNumber || l.id?.slice(0, 8)}</strong>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>v{l.version || 1}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{l.studentName}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                          {l.admissionClass || 'Class 6'} &bull; {l.preferredBoard || 'CBSE'} &bull;{' '}
                          {l.city || 'Uttarakhand'}
                        </div>
                      </td>
                      <td>
                        <div>{l.fatherName || l.parentName || 'Parent'}</div>
                        <div style={{ fontSize: '11.5px', color: '#475569' }}>
                          {l.fatherPhone || l.mobile || 'N/A'}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info">{l.stage || l.current_stage || 'new'}</span>{' '}
                        <span className="badge badge-success">{l.leadScore ?? l.score ?? 0} pts</span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            l.forceExpired
                              ? 'badge-danger'
                              : l.status === 'expired' || l.status === 'suspended'
                              ? 'badge-warning'
                              : 'badge-navy'
                          }`}
                        >
                          {l.forceExpired ? 'Force-Expired (360d)' : l.status || 'new'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => setSelectedLead(l)}
                          >
                            📂 Open Dossier
                          </button>
                          {(l.status === 'expired' || l.forceExpired) && (
                            <button
                              className="btn btn-sm btn-warning"
                              onClick={() =>
                                setReasonModal({
                                  lead: l,
                                  action: 'reopen',
                                  title: l.forceExpired
                                    ? 'Reopen Force-Expired Lead (Restricted)'
                                    : 'Reopen Expired Lead',
                                  placeholder: 'Parent called back requesting admission reopen...',
                                })
                              }
                            >
                              🔓 Reopen
                            </button>
                          )}
                          {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() =>
                                setReasonModal({
                                  lead: l,
                                  action: l.deletedAt ? 'restore' : 'delete',
                                  title: l.deletedAt ? 'Restore Lead' : 'Soft-Delete Lead',
                                  placeholder: 'Duplicate or parent cancelled requirement...',
                                })
                              }
                            >
                              {l.deletedAt ? '♻️' : '🗑️'}
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
        )}
      </div>

      {/* Lead Full Enterprise Dossier Modal */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          schools={schools}
          users={users}
          onClose={() => setSelectedLead(null)}
          onOpenReasonModal={(action, title, placeholder) =>
            setReasonModal({ lead: selectedLead, action, title, placeholder })
          }
          onRefresh={() => {
            onRefresh();
            apiCall(`/leads/${selectedLead.id}`)
              .then((res) => setSelectedLead(res?.lead || res?.data || res))
              .catch(() => {});
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* Styled Reason Modal (Zero window.prompt) */}
      {reasonModal && (
        <div className="modal-overlay" style={{ zIndex: 2200 }} onClick={() => setReasonModal(null)}>
          <div className="modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                {reasonModal.title}
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setReasonModal(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmReasonAction}>
              <div className="modal-body">
                <p style={{ fontSize: '12.5px', color: '#475569' }}>
                  Lead: <strong>{reasonModal.lead.studentName}</strong> (
                  {reasonModal.lead.leadNumber || reasonModal.lead.id})
                </p>
                {reasonModal.action === 'reopen' && reasonModal.lead.forceExpired && (
                  <div
                    style={{
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#991B1B',
                      padding: '10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      marginBottom: '10px',
                    }}
                  >
                    ⚠️ This lead was <strong>Force-Expired at Day 360</strong>. Server business rule #4 rejects reopening and returns: &quot;Please create a new lead.&quot;
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Audit Reason *</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    required
                    placeholder={reasonModal.placeholder}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setReasonModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busyAction}>
                  {busyAction ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACID Side-by-Side Lead Merge Modal */}
      {showMergeModal && (
        <div className="modal-overlay" onClick={() => setShowMergeModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '720px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                🔀 ACID Duplicate Lead Merge ($transaction)
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowMergeModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmMerge}>
              <div className="modal-body">
                <p style={{ fontSize: '12.5px', color: '#475569' }}>
                  All remarks, shortlists, school applications, and commission records from the Secondary lead will be atomically transferred to the Primary lead, and the Secondary lead will be marked <code>merged</code>.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Primary Lead (Keep Active) *</label>
                    <select
                      className="form-control"
                      required
                      value={mergePrimaryId}
                      onChange={(e) => setMergePrimaryId(e.target.value)}
                    >
                      <option value="">-- Select Primary Lead --</option>
                      {leads
                        .filter((l) => l.status !== 'merged')
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.leadNumber || l.id.slice(0, 8)} - {l.studentName} ({l.fatherPhone || l.mobile})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Secondary Duplicate Lead (Mark Merged) *</label>
                    <select
                      className="form-control"
                      required
                      value={mergeSecondaryId}
                      onChange={(e) => setMergeSecondaryId(e.target.value)}
                    >
                      <option value="">-- Select Duplicate Lead --</option>
                      {leads
                        .filter((l) => l.status !== 'merged' && l.id !== mergePrimaryId)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.leadNumber || l.id.slice(0, 8)} - {l.studentName} ({l.fatherPhone || l.mobile})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {primaryLeadObj && secondaryLeadObj && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      background: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#166534' }}>KEEP: {primaryLeadObj.studentName}</strong>
                      <div>Class: {primaryLeadObj.admissionClass}</div>
                      <div>Phone: {primaryLeadObj.fatherPhone || primaryLeadObj.mobile}</div>
                      <div>Stage: {primaryLeadObj.stage || primaryLeadObj.status}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#B45309' }}>MERGE INTO PRIMARY: {secondaryLeadObj.studentName}</strong>
                      <div>Class: {secondaryLeadObj.admissionClass}</div>
                      <div>Phone: {secondaryLeadObj.fatherPhone || secondaryLeadObj.mobile}</div>
                      <div>Stage: {secondaryLeadObj.stage || secondaryLeadObj.status}</div>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Merge Justification *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="Confirmed duplicate student inquiry from parent callback"
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowMergeModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-warning" disabled={busyAction}>
                  {busyAction ? 'Executing Transaction...' : 'Execute ACID Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadDetailModal({
  lead,
  schools,
  users,
  onClose,
  onOpenReasonModal,
  onRefresh,
  onShowToast,
}: {
  lead: any;
  schools: any[];
  users: any[];
  onClose: () => void;
  onOpenReasonModal: (
    action: 'delete' | 'restore' | 'reopen' | 'suspend' | 'expire' | 'force-expire' | 'disqualify',
    title: string,
    placeholder: string
  ) => void;
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<
    'profile' | 'remarks' | 'shortlist' | 'applications' | 'lifecycle' | 'comms'
  >('profile');

  // Edit Profile with Optimistic Lock
  const [editStudentName, setEditStudentName] = useState(lead.studentName || '');
  const [editCity, setEditCity] = useState(lead.city || '');
  const [editBudgetMax, setEditBudgetMax] = useState(String(lead.budgetMax || 800000));
  const [editStage, setEditStage] = useState(lead.stage || 'new');
  const [conflictAlert, setConflictAlert] = useState(false);

  // Remarks
  const [remarks, setRemarks] = useState<any[]>([]);
  const [newRemark, setNewRemark] = useState('');

  // Shortlist + Suggest
  const [shortlists, setShortlists] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [addSchoolId, setAddSchoolId] = useState(schools[0]?.id || '');

  // Applications
  const [applications, setApplications] = useState<any[]>([]);
  const [newAppSchoolId, setNewAppSchoolId] = useState(schools[0]?.id || '');
  const [newAppFee, setNewAppFee] = useState('500000');

  // Lifecycle & Follow-up
  const [lifecycle, setLifecycle] = useState<any>(null);
  const [nextFollowUpDate, setNextFollowUpDate] = useState(
    lead.nextFollowUpDate ? String(lead.nextFollowUpDate).slice(0, 10) : ''
  );
  const [followUpReason, setFollowUpReason] = useState('');

  // Communications
  const [waMessage, setWaMessage] = useState(
    `Namaste ${lead.fatherName || lead.parentName || 'Parent'}! Following up regarding ${lead.studentName}'s Uttarakhand boarding admission.`
  );
  const [callOutcome, setCallOutcome] = useState('Connected - Interested');
  const [callNotes, setCallNotes] = useState('');
  const [pendingBlockMsg, setPendingBlockMsg] = useState<string | null>(null);

  useEffect(() => {
    setEditStudentName(lead.studentName || '');
    setEditCity(lead.city || '');
    setEditBudgetMax(String(lead.budgetMax || 800000));
    setEditStage(lead.stage || 'new');
    setConflictAlert(false);
  }, [lead]);

  const loadDossierData = async () => {
    try {
      const [remRes, slRes, appRes, lifeRes] = await Promise.all([
        apiCall(`/leads/${lead.id}/remarks`).catch(() => ({ remarks: [] })),
        apiCall(`/leads/${lead.id}/shortlists`).catch(() => ({ shortlists: [] })),
        apiCall(`/applications?leadId=${lead.id}`).catch(() => ({ applications: [] })),
        apiCall(`/leads/${lead.id}/expiry-lifecycle`).catch(() => null),
      ]);
      setRemarks(remRes?.remarks || remRes?.data?.remarks || remRes?.data || []);
      setShortlists(slRes?.shortlists || slRes?.data?.shortlists || slRes?.data || []);
      const allApps = appRes?.applications || appRes?.items || appRes?.data?.applications || [];
      setApplications(
        Array.isArray(allApps) ? allApps.filter((a: any) => a.leadId === lead.id) : []
      );
      setLifecycle(lifeRes?.data || lifeRes);
    } catch {
      // ignore non-fatal sub-loads
    }
  };

  useEffect(() => {
    loadDossierData();
  }, [lead.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiCall(`/leads/${lead.id}`, 'PUT', {
        studentName: editStudentName.trim(),
        city: editCity.trim(),
        budgetMax: Number(editBudgetMax || 0),
        stage: editStage,
        version: Number(lead.version || 1),
      });
      onShowToast('Lead updated & version incremented.', 'success');
      setConflictAlert(false);
      onRefresh();
    } catch (err: any) {
      if (err?.status === 409) {
        setConflictAlert(true);
        onShowToast('409 Conflict: Record modified by another user. Please refresh.', 'warning');
      } else {
        onShowToast(err?.message || 'Failed to update lead.', 'danger');
      }
    }
  };

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRemark.trim()) return;
    try {
      await apiCall(`/leads/${lead.id}/remarks`, 'POST', { note: newRemark.trim() });
      setNewRemark('');
      onShowToast('Remark appended permanently.', 'success');
      loadDossierData();
    } catch (err: any) {
      onShowToast(err?.message || 'Could not append remark.', 'danger');
    }
  };

  const handleRunSuggestions = async () => {
    try {
      const res = await apiCall('/match/suggest', 'POST', { leadId: lead.id, topN: 10 });
      const list = res?.matches || res?.schools || res?.data?.matches || res?.data || [];
      setSuggestions(Array.isArray(list) ? list : []);
      onShowToast(`Scored ${Array.isArray(list) ? list.length : 0} matching schools using 8 criteria weights!`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to run 8-criteria match engine.', 'danger');
    }
  };

  const handleAddShortlist = async (schoolIdToAdd: string) => {
    if (!schoolIdToAdd) return;
    try {
      await apiCall(`/leads/${lead.id}/shortlist`, 'POST', {
        school_id: schoolIdToAdd,
        priority_rank: shortlists.length + 1,
      });
      onShowToast('School added to shortlist.', 'success');
      loadDossierData();
    } catch (err: any) {
      onShowToast(err?.message || 'Shortlist failed (check unique constraint).', 'warning');
    }
  };

  const handleRemoveShortlist = async (schoolId: string) => {
    try {
      await apiCall(`/leads/${lead.id}/shortlist/${schoolId}`, 'DELETE');
      onShowToast('Removed from shortlist.', 'success');
      loadDossierData();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to remove shortlist.', 'danger');
    }
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppSchoolId) return;
    try {
      await apiCall('/applications', 'POST', {
        leadId: lead.id,
        schoolId: newAppSchoolId,
        appliedClass: lead.admissionClass || 'Class 6',
        academicYear: '2026-27',
        annualFee: Number(newAppFee || 500000),
      });
      onShowToast('School application created at Sub-Stage A (Waiting).', 'success');
      loadDossierData();
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to create application.', 'danger');
    }
  };

  const handleUpdateSubStage = async (app: any, subStage: string) => {
    try {
      const res = await apiCall(`/applications/${app.id}/sub-stage`, 'PUT', {
        sub_stage: subStage,
        annualFee: Number(app.confirmedRevenue || newAppFee || 500000),
      });
      const comm = res?.commission || res?.data?.commission;
      if (subStage === 'C_formalities_done' && comm?.id) {
        onShowToast('Sub-Stage C completed! Commission entry automatically generated.', 'success');
      } else {
        onShowToast(`Updated sub-stage to ${subStage} (No commission before C).`, 'success');
      }
      loadDossierData();
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update sub-stage.', 'danger');
    }
  };

  const handleUpdateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (followUpReason.trim().length < 5) {
      onShowToast('Follow-up change reason must be at least 5 characters.', 'warning');
      return;
    }
    try {
      await apiCall(`/leads/${lead.id}/follow-up`, 'PUT', {
        nextFollowUpDate,
        reason: followUpReason.trim(),
      });
      setFollowUpReason('');
      onShowToast('Follow-up date updated & audited.', 'success');
      loadDossierData();
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Follow-up update failed.', 'danger');
    }
  };

  const handleExtendCycle = async () => {
    try {
      await apiCall(`/leads/${lead.id}/extend-cycle`, 'POST', { reason: 'Parent actively engaged' });
      onShowToast('90-day cycle extended!', 'success');
      loadDossierData();
    } catch (err: any) {
      onShowToast(err?.message || 'Cycle extend failed.', 'danger');
    }
  };

  const handleGenerateWaLink = async () => {
    setPendingBlockMsg(null);
    if (waMessage.length > 2000) {
      onShowToast('WhatsApp message cannot exceed 2000 characters.', 'danger');
      return;
    }
    try {
      const res = await apiCall('/whatsapp/generate-link', 'POST', {
        lead_id: lead.id,
        message: waMessage.trim(),
      });
      const url = res?.waUrl || res?.url || res?.data?.waUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      window.dispatchEvent(new CustomEvent('crm-logging-queue-updated'));
      onShowToast('WhatsApp link opened & added to Pending Logging Queue.', 'success');
    } catch (err: any) {
      if (err?.status === 409) {
        setPendingBlockMsg(err.message);
        onShowToast('409 Layer-3 Block: Resolve pending outcome on prior lead first.', 'warning');
      } else {
        onShowToast(err?.message || 'WhatsApp error.', 'danger');
      }
    }
  };

  const handleLogCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setPendingBlockMsg(null);
    try {
      await apiCall('/calls/log', 'POST', {
        lead_id: lead.id,
        outcome: callOutcome,
        notes: callNotes.trim() || callOutcome,
      });
      setCallNotes('');
      window.dispatchEvent(new CustomEvent('crm-logging-queue-updated'));
      onShowToast('Call logged & audited!', 'success');
      loadDossierData();
    } catch (err: any) {
      if (err?.status === 409) {
        setPendingBlockMsg(err.message);
      } else {
        onShowToast(err?.message || 'Call log failed.', 'danger');
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '880px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
              📂 {lead.studentName} ({lead.leadNumber || lead.id?.slice(0, 8)}) &bull; v{lead.version || 1}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Score: <strong>{lead.leadScore ?? lead.score ?? 0}</strong> &bull; Class:{' '}
              {lead.admissionClass} &bull; Mobile: {lead.fatherPhone || lead.mobile}
            </span>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Sub-Tabs */}
        <div style={{ display: 'flex', gap: '6px', padding: '10px 20px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap', background: '#F8FAFC' }}>
          {(
            [
              ['profile', '👤 Profile (v' + (lead.version || 1) + ')'],
              ['remarks', `💬 Remarks (${remarks.length})`],
              ['shortlist', `🏫 AI Match & Shortlist (${shortlists.length})`],
              ['applications', `🎓 Applications (${applications.length})`],
              ['lifecycle', '⏳ Lifecycle & Follow-up'],
              ['comms', '📱 WA & Call (3-Layer)'],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              className={`btn btn-sm ${activeTab === k ? 'btn-navy' : 'btn-outline'}`}
              onClick={() => setActiveTab(k)}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile}>
              {conflictAlert && (
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1px solid #F59E0B',
                    color: '#92400E',
                    padding: '10px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>⚠️ 409 Conflict: Someone else updated this lead. Refresh version before saving!</span>
                  <button type="button" className="btn btn-sm btn-warning" onClick={onRefresh}>
                    🔄 Reload Latest Version
                  </button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Student Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editStudentName}
                    onChange={(e) => setEditStudentName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Preferred Location / City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Annual Budget (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editBudgetMax}
                    onChange={(e) => setEditBudgetMax(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Pipeline Stage</label>
                  <select
                    className="form-control"
                    value={editStage}
                    onChange={(e) => setEditStage(e.target.value)}
                  >
                    {BLUEPRINT_KANBAN_STAGES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <span style={{ fontSize: '12px', color: '#475569' }}>
                  DPDP Consent: {lead.dpdpConsent || lead.dpdp_consent ? '✅ Recorded' : '⏳ Pending'} &bull; Optimistic Lock Version: <strong>v{lead.version || 1}</strong>
                </span>
                <button type="submit" className="btn btn-primary">
                  💾 Save Profile (Optimistic Lock)
                </button>
              </div>
            </form>
          )}

          {activeTab === 'remarks' && (
            <div>
              <form onSubmit={handleAddRemark} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Append permanent remark (never overwrites old notes)..."
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  Append Remark
                </button>
              </form>
              {remarks.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: '#64748B' }}>No remarks logged yet.</div>
              ) : (
                remarks.map((r: any) => (
                  <div
                    key={r.id}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ fontSize: '13px', color: '#0F172A' }}>{r.content || r.note}</div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                      {r.author?.fullName || 'CRM Staff'} &bull;{' '}
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'shortlist' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <button className="btn btn-primary btn-sm" onClick={handleRunSuggestions}>
                  ✨ Run 8-Criteria AI School Match
                </button>
                <select
                  className="form-control"
                  style={{ maxWidth: '280px' }}
                  value={addSchoolId}
                  onChange={(e) => setAddSchoolId(e.target.value)}
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleAddShortlist(addSchoolId)}
                >
                  ➕ Shortlist School
                </button>
              </div>

              {suggestions.length > 0 && (
                <div style={{ marginBottom: '14px', background: '#EFF6FF', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A8A', marginBottom: '6px' }}>
                    Top Weighted Matches:
                  </div>
                  {suggestions.slice(0, 5).map((m: any) => (
                    <div
                      key={m.school?.id || m.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '5px 0',
                        borderBottom: '1px solid #DBEAFE',
                        fontSize: '12px',
                      }}
                    >
                      <span>
                        <strong>{m.school?.name || m.name}</strong> ({m.school?.city || m.city}) &mdash; Score:{' '}
                        <strong>{Math.round(Number(m.matchScore ?? m.score ?? 0))}%</strong>
                      </span>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleAddShortlist(m.school?.id || m.id)}
                      >
                        Shortlist
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>School</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortlists.map((sl: any, i: number) => (
                      <tr key={sl.id || i}>
                        <td>#{sl.priorityRank ?? i + 1}</td>
                        <td>
                          <strong>{sl.school?.name || sl.schoolName || sl.schoolId}</strong>
                        </td>
                        <td>
                          <span className="badge badge-info">{sl.status || 'shortlisted'}</span>
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleRemoveShortlist(sl.schoolId)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'applications' && (
            <div>
              <form
                onSubmit={handleCreateApplication}
                style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}
              >
                <select
                  className="form-control"
                  style={{ flex: 2 }}
                  value={newAppSchoolId}
                  onChange={(e) => setNewAppSchoolId(e.target.value)}
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="form-control"
                  style={{ flex: 1 }}
                  placeholder="Annual Fee ₹"
                  value={newAppFee}
                  onChange={(e) => setNewAppFee(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  🎓 Apply to School
                </button>
              </form>

              {applications.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: '#64748B' }}>
                  No school applications submitted yet. Commission triggers strictly at Sub-Stage C.
                </div>
              ) : (
                applications.map((app: any) => (
                  <div
                    key={app.id}
                    style={{
                      border: '1px solid #CBD5E1',
                      borderRadius: '10px',
                      padding: '12px',
                      marginBottom: '10px',
                      background: '#FFFFFF',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong>{app.school?.name || 'School Application'}</strong> &bull; Stage:{' '}
                        <span className="badge badge-info">{app.stage || 'applied'}</span>
                      </div>
                      <div>
                        Sub-Stage:{' '}
                        <span
                          className={`badge ${
                            app.subStage === 'C_formalities_done' ? 'badge-success' : 'badge-warning'
                          }`}
                        >
                          {app.subStage || 'A_waiting'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleUpdateSubStage(app, 'A_waiting')}
                      >
                        Set A (Waiting)
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleUpdateSubStage(app, 'B_only_registration')}
                      >
                        Set B (Registration Only)
                      </button>
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleUpdateSubStage(app, 'C_formalities_done')}
                      >
                        ✓ Set C (Formalities Done → Generate Commission)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'lifecycle' && (
            <div>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12.5px' }}>
                <div>
                  Cycle Status: <strong>{lifecycle?.cycle || 'Day 0-90 Active Cycle'}</strong> &bull;
                  Force-Expired: <strong>{lead.forceExpired ? 'YES (Locked Forever)' : 'No'}</strong>
                </div>
              </div>

              <form onSubmit={handleUpdateFollowUp} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', alignItems: 'end' }}>
                  <div>
                    <label className="form-label">Follow-up Date</label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={nextFollowUpDate}
                      onChange={(e) => setNextFollowUpDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Mandatory Reason (min 5 chars)</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="Parent requested call next week..."
                      value={followUpReason}
                      onChange={(e) => setFollowUpReason(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Save Date
                  </button>
                </div>
              </form>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-success" onClick={handleExtendCycle}>
                  ⏩ Extend 90-Day Cycle
                </button>
                <button
                  className="btn btn-sm btn-warning"
                  onClick={() =>
                    onOpenReasonModal('suspend', 'Suspend Lead', 'Parent travelling abroad for 3 months...')
                  }
                >
                  ⏸️ Suspend
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() =>
                    onOpenReasonModal('expire', 'Soft Expire (Reopenable)', 'Day 90 inactivity review')
                  }
                >
                  Expire (Soft)
                </button>
                {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() =>
                      onOpenReasonModal(
                        'force-expire',
                        'Force Expire (Day 360 Permanent)',
                        'Day 360 hard expiry — blocks reopen permanently'
                      )
                    }
                  >
                    🔒 Force-Expire (360d)
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'comms' && (
            <div>
              {pendingBlockMsg && (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    padding: '10px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    fontSize: '12px',
                  }}
                >
                  🔒 <strong>409 Layer-3 Lock Active:</strong> {pendingBlockMsg}
                </div>
              )}
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label">
                  WhatsApp Message ({waMessage.length}/2000 chars)
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                />
                <button
                  className="btn btn-success btn-sm"
                  style={{ marginTop: '8px' }}
                  onClick={handleGenerateWaLink}
                >
                  💬 Open wa.me &amp; Queue Confirmation
                </button>
              </div>
              <form onSubmit={handleLogCall} style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Log Call Outcome</label>
                  <select
                    className="form-control"
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                  >
                    <option value="Connected - Interested">Connected - Interested</option>
                    <option value="Connected - Needs Callback">Connected - Needs Callback</option>
                    <option value="Ringing / No Answer">Ringing / No Answer</option>
                    <option value="Switched Off / Not Reachable">Switched Off / Not Reachable</option>
                    <option value="Not Interested">Not Interested</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Call Summary</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Notes from call..."
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-sm">
                  📞 Log Call Outcome
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CreateLeadModal({
  isOpen,
  onClose,
  schools = [],
  onSuccess,
  onShowToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  schools?: any[];
  onSuccess: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [studentName, setStudentName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [fatherPhone, setFatherPhone] = useState('');
  const [motherPhone, setMotherPhone] = useState('');
  const [admissionClass, setAdmissionClass] = useState('Class 6');
  const [preferredBoard, setPreferredBoard] = useState('CBSE');
  const [city, setCity] = useState('Dehradun');
  const [budgetMax, setBudgetMax] = useState('800000');
  const [leadSource, setLeadSource] = useState('Website');
  const [dpdpConsent, setDpdpConsent] = useState(true);
  const [dupWarning, setDupWarning] = useState<any>(null);
  const [expiredMatch, setExpiredMatch] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const runDuplicateAndExpiredChecks = async () => {
    if (!fatherPhone.trim()) return;
    try {
      const [dRes, eRes] = await Promise.all([
        apiCall('/leads/check-duplicate', 'POST', {
          mobile: fatherPhone.trim(),
          studentName: studentName.trim(),
        }).catch(() => null),
        apiCall('/leads/check-expired-match', 'POST', {
          mobile: fatherPhone.trim(),
          studentName: studentName.trim(),
        }).catch(() => null),
      ]);
      const dups = dRes?.duplicates || dRes?.matches || dRes?.data?.duplicates || [];
      setDupWarning(Array.isArray(dups) && dups.length > 0 ? dups[0] : null);
      const exp = eRes?.expiredLead || eRes?.match || eRes?.data?.expiredLead || null;
      setExpiredMatch(exp);
    } catch {
      // ignore pre-check errors
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dpdpConsent) {
      onShowToast('DPDP parent data consent checkbox is required.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await apiCall('/leads', 'POST', {
        studentName: studentName.trim(),
        fatherName: fatherName.trim(),
        parentName: fatherName.trim(),
        mobile: fatherPhone.trim(),
        fatherPhone: fatherPhone.trim(),
        motherPhone: motherPhone.trim() || undefined,
        admissionClass,
        preferredBoard,
        city,
        budgetMax: Number(budgetMax || 800000),
        leadSource,
        dpdpConsent,
      });
      onShowToast(`New lead ${studentName} created cleanly!`, 'success');
      setStudentName('');
      setFatherName('');
      setFatherPhone('');
      setMotherPhone('');
      setDupWarning(null);
      setExpiredMatch(null);
      onSuccess();
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || 'Lead creation failed.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenExpiredMatch = async () => {
    if (!expiredMatch?.id) return;
    try {
      await apiCall(`/leads/${expiredMatch.id}/reopen`, 'POST', {
        reason: 'Reopened from new inquiry expired-match prompt',
      });
      onShowToast('Previous expired lead reopened!', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || 'Please create a new lead.', 'danger');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
            ➕ Create Student &amp; Parent Enquiry
          </h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {dupWarning && (
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #F59E0B',
                  color: '#92400E',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  marginBottom: '12px',
                }}
              >
                ⚠️ Possible duplicate found: <strong>{dupWarning.studentName}</strong> ({dupWarning.leadNumber})
              </div>
            )}
            {expiredMatch && (
              <div
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #93C5FD',
                  color: '#1E3A8A',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  marginBottom: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  {expiredMatch.forceExpired
                    ? '🔒 Matched a Force-Expired (360d) lead. Please create a new lead.'
                    : `♻️ Matched expired lead ${expiredMatch.leadNumber || ''}.`}
                </span>
                {!expiredMatch.forceExpired && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleReopenExpiredMatch}
                  >
                    Reopen Instead
                  </button>
                )}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Student Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Father / Parent Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Primary Mobile (+91 Auto) *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="9876543210"
                  value={fatherPhone}
                  onChange={(e) => setFatherPhone(e.target.value)}
                  onBlur={runDuplicateAndExpiredChecks}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mother / Alt Mobile</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Optional"
                  value={motherPhone}
                  onChange={(e) => setMotherPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Class Applying</label>
                <select
                  className="form-control"
                  value={admissionClass}
                  onChange={(e) => setAdmissionClass(e.target.value)}
                >
                  {['Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Preferred Board</label>
                <select
                  className="form-control"
                  value={preferredBoard}
                  onChange={(e) => setPreferredBoard(e.target.value)}
                >
                  <option value="CBSE">CBSE</option>
                  <option value="ICSE">ICSE</option>
                  <option value="IB">IB</option>
                  <option value="IGCSE">IGCSE</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Location / City</label>
                <input
                  type="text"
                  className="form-control"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Max Budget (₹)</label>
                <input
                  type="number"
                  className="form-control"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Lead Source</label>
                <select
                  className="form-control"
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value)}
                >
                  <option value="Website">Website</option>
                  <option value="Phone Inquiry">Phone Inquiry</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Referral">Referral</option>
                  <option value="Walk-in">Walk-in</option>
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginTop: '8px' }}>
              <input
                type="checkbox"
                checked={dpdpConsent}
                onChange={(e) => setDpdpConsent(e.target.checked)}
              />
              <span>Parent DPDP Data Processing Consent Obtained (90-day retention compliant)</span>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating Lead...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
