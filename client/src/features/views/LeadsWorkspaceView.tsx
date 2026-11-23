import React, { useEffect, useMemo, useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall, downloadApiFile } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { BLUEPRINT_KANBAN_STAGES, hasRole } from '../../lib/roles';
import KanbanBoard from '../kanban/KanbanBoard';
import LeadReportModal from '../leads/LeadReportModal';
import EditLeadModal from '../leads/EditLeadModal';

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
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [selectedReportLead, setSelectedReportLead] = useState<any | null>(null);
  const [selectedScoreLead, setSelectedScoreLead] = useState<any | null>(null);
  const [scoreBreakdown, setScoreBreakdown] = useState<Record<string, number> | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
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
  const [suspendPeriod, setSuspendPeriod] = useState<'30' | '90' | '180' | 'custom'>('90');
  const [customSuspendDays, setCustomSuspendDays] = useState('45');
  const [reopenAssignTo, setReopenAssignTo] = useState('');
  const [expireDecision, setExpireDecision] = useState<'EXPIRE' | 'EXTEND'>('EXPIRE');
  const [busyAction, setBusyAction] = useState(false);

  const openScoreModal = async (lead: any) => {
    setSelectedScoreLead(lead);
    setScoreBreakdown(lead?.scoreBreakdown || null);
    setScoreLoading(true);
    try {
      const res = await apiCall(`/leads/${lead.id}`);
      const detail = res?.lead || res?.data?.lead || res?.data || res;
      if (detail && detail.id) {
        setSelectedScoreLead(detail);
        setScoreBreakdown(detail.scoreBreakdown || null);
      }
    } catch {
      // Fallback to existing lead fields if detail fetch fails
    } finally {
      setScoreLoading(false);
    }
  };

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
        await apiCall(`/leads/${id}/reopen`, 'POST', {
          reason,
          assign_to: reopenAssignTo || undefined,
          assignTo: reopenAssignTo || undefined,
        });
        onShowToast(`Lead reopened into active workflow (+3 day follow-up set, score recalculated).`, 'success');
      } else if (reasonModal.action === 'suspend') {
        const days = suspendPeriod === 'custom' ? Math.max(1, Number(customSuspendDays) || 30) : Number(suspendPeriod);
        await apiCall(`/leads/${id}/suspend`, 'POST', { reason, suspend_days: days, suspendDays: days });
        onShowToast(`Lead suspended for ${days} days (Manager approved; early exit allowed).`, 'warning');
      } else if (reasonModal.action === 'expire') {
        if (expireDecision === 'EXTEND') {
          await apiCall(`/leads/${id}/expire`, 'POST', { action: 'EXTEND', reason, force: false });
          onShowToast(`Lead extended by +90 days (new 90-day cycle started).`, 'success');
        } else {
          await apiCall(`/leads/${id}/expire`, 'POST', { action: 'EXPIRE', reason, force: false });
          onShowToast(`Lead marked expired (soft — can still reopen).`, 'warning');
        }
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
            <h3 className="card-title"><CrmIcon name="clipboard" size={16} /> Student &amp; Parent Lead Management</h3>
            <span className="card-subtitle">
              Full lead dossier, 8-criteria school matching, 12-stage Kanban pipeline, ACID merge &amp; 90-90-90-360 lifecycle
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${viewMode === 'table' ? 'btn-navy' : 'btn-outline'}`}
              onClick={() => setViewMode('table')}
            >
              <CrmIcon name="file-text" size={16} /> Table View
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'kanban' ? 'btn-navy' : 'btn-outline'}`}
              onClick={() => setViewMode('kanban')}
            >
              <CrmIcon name="folder-open" size={16} /> 12-Stage Kanban
            </button>
            {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
              <button
                className="btn btn-sm btn-warning"
                onClick={() => setShowMergeModal(true)}
              >
                <CrmIcon name="git-merge" size={16} /> ACID Merge Duplicates
              </button>
            )}
            <button
              className="btn btn-sm btn-success"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Download Leads Excel (Image 2 format with 0 duplicates)"
              onClick={async () => {
                try {
                  await downloadApiFile(
                    '/reports/leads?format=excel',
                    'Student_Leads_Master.xlsx'
                  );
                  onShowToast('Student Leads Excel report downloaded successfully!', 'success');
                } catch (err: any) {
                  onShowToast(err?.message || 'Failed to download Leads Excel.', 'danger');
                }
              }}
            >
              <CrmIcon name="download" size={15} /> Export Leads (.xlsx)
            </button>
            <button
              className="btn btn-sm btn-primary"
              style={{ background: '#0D9488', borderColor: '#0D9488', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Download All-Time Permanent Database of Leads"
              onClick={async () => {
                try {
                  await downloadApiFile(
                    '/reports/leads?format=excel&all_time=true',
                    'Student_Leads_AllTime_Permanent.xlsx'
                  );
                  onShowToast('All-Time Permanent Leads Excel downloaded successfully!', 'success');
                } catch (err: any) {
                  onShowToast(err?.message || 'Failed to download All-Time Leads.', 'danger');
                }
              }}
            >
              <CrmIcon name="database" size={15} /> All-Time Leads (.xlsx)
            </button>
            <button className="btn btn-sm btn-primary" onClick={onOpenNewLead}>
              <CrmIcon name="plus" size={16} /> Add Student Lead
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
                  displayLeads.map((l: any) => {
                    const scoreVal = Number(l.leadScore ?? l.score ?? 0);
                    const scoreBadgeBg =
                      scoreVal >= 80 ? '#ECFDF5' : scoreVal >= 55 ? '#EFF6FF' : '#FFFBEB';
                    const scoreBadgeBorder =
                      scoreVal >= 80 ? '#A7F3D0' : scoreVal >= 55 ? '#BFDBFE' : '#FDE68A';
                    const scoreBadgeText =
                      scoreVal >= 80 ? '#047857' : scoreVal >= 55 ? '#1D4ED8' : '#B45309';

                    return (
                    <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }}>
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px', letterSpacing: '0.01em' }}>
                          {l.leadNumber || l.id?.slice(0, 8)}
                        </div>
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: '2px',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            fontSize: '10px',
                            fontWeight: 600,
                            background: '#F1F5F9',
                            color: '#64748B',
                          }}
                        >
                          v{l.version || 1}
                        </span>
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13.5px' }}>{l.studentName}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                          {l.admissionClass || 'Class 6'} &bull; {l.preferredBoard || 'CBSE'} &bull;{' '}
                          {l.city || 'Uttarakhand'}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '13px' }}>
                          {l.fatherName || l.parentName || 'Parent'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                          {l.fatherPhone || l.parentPhone || l.mobile || 'N/A'}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>
                            {l.stage || l.current_stage || 'new'}
                          </span>
                          <button
                            type="button"
                            onClick={() => openScoreModal(l)}
                            title="Click to view Lead Score breakdown"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              background: scoreBadgeBg,
                              border: `1px solid ${scoreBadgeBorder}`,
                              color: scoreBadgeText,
                              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                            }}
                          >
                            <CrmIcon name="bar-chart" size={12} />
                            {scoreVal} pts
                          </button>
                        </div>
                        {l.verificationStatus === 'RETURNED' && (
                          <div style={{ marginTop: '4px' }}>
                            <span className="badge badge-danger" title={l.returnRemarks || ''}>
                              <CrmIcon name="alert" size={14} /> Correction Required: {l.returnRemarks || 'Fix Info'}
                            </span>
                          </div>
                        )}
                        {l.verificationStatus === 'APPROVED' && (
                          <div style={{ marginTop: '4px' }}>
                            <span className="badge badge-success">
                              <CrmIcon name="check-circle" size={14} /> Verified Genuine
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <span
                          className={`badge ${
                            l.forceExpired
                              ? 'badge-danger'
                              : l.status === 'expired' || l.status === 'suspended'
                              ? 'badge-warning'
                              : 'badge-navy'
                          }`}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {l.forceExpired ? 'Force-Expired (360d)' : String(l.status || 'new').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'nowrap' }}>
                          <a
                            href={`tel:${(l.fatherPhone || l.parentPhone || l.mobile || '').replace(/\s+/g, '')}`}
                            className="btn btn-sm btn-outline"
                            style={{
                              textDecoration: 'none',
                              width: '32px',
                              height: '32px',
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '8px',
                            }}
                            title="Call Parent"
                            aria-label="Call Parent"
                          >
                            <CrmIcon name="phone" size={15} />
                          </a>
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            style={{
                              width: '32px',
                              height: '32px',
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '8px',
                            }}
                            title="Send WhatsApp Message"
                            aria-label="Send WhatsApp Message"
                            onClick={async () => {
                              const tpl = `Namaste ${l.fatherName || l.parentName || 'Parent'}! Sharing BoardingEdu admission details for ${l.studentName} (${l.admissionClass || l.applyingForGrade || 'Class 6'}, Budget: ₹${Number(l.budgetMax || 450000).toLocaleString('en-IN')}). Documents upload & school brochure link: https://boardingedu.com/docs/${l.leadNumber || l.id?.slice(0, 6)}`;
                              try {
                                const res = await apiCall('/whatsapp/generate-link', 'POST', {
                                  lead_id: l.id,
                                  message: tpl,
                                });
                                const url = res?.waUrl || res?.url || res?.data?.waUrl;
                                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                onShowToast('WhatsApp template with student details & document link opened!', 'success');
                              } catch (err: any) {
                                const ph = String(l.fatherPhone || l.parentPhone || l.mobile || '').replace(/\D/g, '').slice(-10);
                                window.open(`https://wa.me/91${ph}?text=${encodeURIComponent(tpl)}`, '_blank');
                              }
                            }}
                          >
                            <CrmIcon name="whatsapp" size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-navy"
                            style={{
                              width: '32px',
                              height: '32px',
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '8px',
                            }}
                            onClick={() => setSelectedReportLead(l)}
                            title="Student Admission Report"
                            aria-label="Student Admission Report"
                          >
                            <CrmIcon name="file-text" size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-warning"
                            style={{
                              background: '#F59E0B',
                              borderColor: '#D97706',
                              color: '#fff',
                              width: '32px',
                              height: '32px',
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '8px',
                            }}
                            onClick={() => setEditingLead(l)}
                            title="Edit Student & Parent Details"
                            aria-label="Edit Student & Parent Details"
                          >
                            <CrmIcon name="edit" size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            style={{ height: '32px', borderRadius: '8px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            onClick={() => setSelectedLead(l)}
                          >
                            <CrmIcon name="folder-open" size={15} /> Open Dossier
                          </button>
                          {(l.status === 'expired' || l.forceExpired) && (
                            <button
                              type="button"
                              className="btn btn-sm btn-warning"
                              style={{ height: '32px', borderRadius: '8px' }}
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
                              <CrmIcon name="unlock" size={15} /> Reopen
                            </button>
                          )}
                          {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              style={{
                                width: '32px',
                                height: '32px',
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '8px',
                              }}
                              title={l.deletedAt ? 'Restore Lead' : 'Delete Lead'}
                              aria-label={l.deletedAt ? 'Restore Lead' : 'Delete Lead'}
                              onClick={() =>
                                setReasonModal({
                                  lead: l,
                                  action: l.deletedAt ? 'restore' : 'delete',
                                  title: l.deletedAt ? 'Restore Lead' : 'Soft-Delete Lead',
                                  placeholder: 'Duplicate or parent cancelled requirement...',
                                })
                              }
                            >
                              {l.deletedAt ? <CrmIcon name="refresh" size={15} /> : <CrmIcon name="trash" size={15} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
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

      {/* Student Lead Report Modal (Matches Image 2) */}
      {selectedReportLead && (
        <LeadReportModal
          lead={selectedReportLead}
          schools={schools}
          onClose={() => setSelectedReportLead(null)}
          onRefresh={onRefresh}
          onShowToast={onShowToast}
        />
      )}

      {/* Lead Edit Modal */}
      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onRefresh={onRefresh}
          onShowToast={onShowToast}
        />
      )}

      {/* Clickable Lead Score Breakdown Modal */}
      {selectedScoreLead && (
        <div className="modal-overlay" style={{ zIndex: 2150 }} onClick={() => setSelectedScoreLead(null)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                  <CrmIcon name="bar-chart" size={16} /> Lead Score Breakdown
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {selectedScoreLead.studentName} ({selectedScoreLead.leadNumber || selectedScoreLead.id?.slice(0, 8)})
                </span>
              </div>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setSelectedScoreLead(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(() => {
                const total = Number(selectedScoreLead.leadScore ?? selectedScoreLead.score ?? 0);
                const tier =
                  total >= 80
                    ? { label: 'Hot / High Intent', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' }
                    : total >= 55
                    ? { label: 'Warm / Active', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' }
                    : { label: 'Nurture / Early Stage', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' };
                const bd = scoreBreakdown || {};
                const rows = [
                  { key: 'budget_match', label: 'Budget Match', max: 30 },
                  { key: 'engagement', label: 'Parent Engagement (Calls & WA)', max: 25 },
                  { key: 'source_quality', label: 'Lead Source Quality', max: 20 },
                  { key: 'timeline_urgency', label: 'Session & Timeline Urgency', max: 15 },
                  { key: 'class_demand', label: 'Class / Grade Demand', max: 10 },
                ];
                return (
                  <>
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: tier.bg,
                        border: `1px solid ${tier.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>TOTAL LEAD SCORE</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: tier.color }}>{total} / 100 pts</div>
                      </div>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: '#fff',
                          color: tier.color,
                          border: `1px solid ${tier.border}`,
                        }}
                      >
                        {tier.label}
                      </span>
                    </div>

                    {scoreLoading && !scoreBreakdown ? (
                      <div style={{ fontSize: '12.5px', color: '#64748B', textAlign: 'center', padding: '10px' }}>
                        Loading score breakdown...
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {rows.map((r) => {
                          const val = Number((bd as any)[r.key] ?? 0);
                          const pct = Math.min(100, Math.round((val / r.max) * 100));
                          return (
                            <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                                <span>{r.label}</span>
                                <span>{val} pts</span>
                              </div>
                              <div style={{ height: '7px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: '#2563EB', borderRadius: '999px' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  const target = selectedScoreLead;
                  setSelectedScoreLead(null);
                  setSelectedLead(target);
                }}
              >
                <CrmIcon name="folder-open" size={14} /> Open Full Dossier
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setSelectedScoreLead(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
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
                <CrmIcon name="x" size={16} />
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
                    <CrmIcon name="alert" size={16} /> This lead was <strong>Force-Expired at Day 360</strong>. Server business rule #4 rejects reopening and returns: &quot;Please create a new lead.&quot;
                  </div>
                )}
                {reasonModal.action === 'reopen' && !reasonModal.lead.forceExpired && (
                  <div className="form-group">
                    <label className="form-label">Assign Reopened Lead to Counsellor (Commission Beneficiary)</label>
                    <select
                      className="form-control"
                      value={reopenAssignTo}
                      onChange={(e) => setReopenAssignTo(e.target.value)}
                    >
                      <option value="">Keep Current / Default Counsellor</option>
                      {users
                        .filter((u: any) =>
                          String(u.role || u.canonicalRole || '').toLowerCase().includes('counsellor') ||
                          String(u.role || u.canonicalRole || '').toLowerCase().includes('manager')
                        )
                        .map((u: any) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} ({u.role})
                          </option>
                        ))}
                    </select>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                      Same Lead ID preserved &bull; Old remarks preserved &bull; Score auto-recalculated &bull; Follow-up auto-set (+3 days)
                    </div>
                  </div>
                )}
                {reasonModal.action === 'suspend' && (
                  <div className="form-group">
                    <label className="form-label">Suspend Period (Manager Approval)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                      {[
                        { val: '30', label: '1 Month' },
                        { val: '90', label: '3 Months' },
                        { val: '180', label: '6 Months' },
                        { val: 'custom', label: 'Custom' },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          className={`btn btn-sm ${suspendPeriod === opt.val ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setSuspendPeriod(opt.val as any)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {suspendPeriod === 'custom' && (
                      <input
                        type="number"
                        min={1}
                        max={365}
                        className="form-control"
                        placeholder="Enter custom days (e.g. 45)"
                        value={customSuspendDays}
                        onChange={(e) => setCustomSuspendDays(e.target.value)}
                      />
                    )}
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                      Early exit allowed anytime if parent calls back. After suspend ends with no response, a new 90-day cycle begins.
                    </div>
                  </div>
                )}
                {reasonModal.action === 'expire' && (
                  <div className="form-group">
                    <label className="form-label">90-Day Cycle Decision (No Auto-Expire)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${expireDecision === 'EXTEND' ? 'btn-success' : 'btn-outline'}`}
                        onClick={() => setExpireDecision('EXTEND')}
                      >
                        +90 More Days (Extend)
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${expireDecision === 'EXPIRE' ? 'btn-warning' : 'btn-outline'}`}
                        onClick={() => setExpireDecision('EXPIRE')}
                      >
                        Mark Expired (Reopenable)
                      </button>
                    </div>
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
                <CrmIcon name="git-merge" size={16} /> ACID Duplicate Lead Merge ($transaction)
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowMergeModal(false)}>
                <CrmIcon name="x" size={16} />
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
                          <option key={l.id} value={l.id}>{l.leadNumber || l.id.slice(0, 8)} - {l.studentName} ({l.fatherPhone || l.mobile})</option>
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
                          <option key={l.id} value={l.id}>{l.leadNumber || l.id.slice(0, 8)} - {l.studentName} ({l.fatherPhone || l.mobile})</option>
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

  // Communications & Verification
  const [waMessage, setWaMessage] = useState(
    `Namaste ${lead.fatherName || lead.parentName || 'Parent'}! Sharing BoardingEdu admission details for ${lead.studentName} (${lead.admissionClass || lead.applyingForGrade || 'Class 6'}, Budget: ₹${Number(lead.budgetMax || 450000).toLocaleString('en-IN')}). Upload documents & view shortlisted schools here: https://boardingedu.com/docs/${lead.leadNumber || lead.id?.slice(0, 6)}`
  );
  const [callOutcome, setCallOutcome] = useState('Connected - Interested');
  const [callNotes, setCallNotes] = useState('');
  const [pendingBlockMsg, setPendingBlockMsg] = useState<string | null>(null);
  const [returnReasonText, setReturnReasonText] = useState(lead.returnRemarks || '');
  const [manualSchoolName, setManualSchoolName] = useState('');
  const [manualSchoolCity, setManualSchoolCity] = useState('Dehradun');
  const [manualSchoolBoard, setManualSchoolBoard] = useState('CBSE');
  const [manualSchoolFee, setManualSchoolFee] = useState('450000');

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
              <CrmIcon name="folder-open" size={16} /> {lead.studentName} ({lead.leadNumber || lead.id?.slice(0, 8)}) &bull; v{lead.version || 1}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Score: <strong>{lead.leadScore ?? lead.score ?? 0}</strong> &bull; Class:{' '}
              {lead.admissionClass} &bull; Mobile: {lead.fatherPhone || lead.mobile}
            </span>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            <CrmIcon name="x" size={16} />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div style={{ display: 'flex', gap: '6px', padding: '10px 20px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap', background: '#F8FAFC' }}>
          {(
            [
              ['profile', 'Profile (v' + (lead.version || 1) + ')'],
              ['remarks', `Remarks (${remarks.length})`],
              ['shortlist', `AI Match & Shortlist (${shortlists.length})`],
              ['applications', `Applications (${applications.length})`],
              ['lifecycle', 'Lifecycle & Follow-up'],
              ['comms', 'WA & Call (3-Layer)'],
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
            <div>
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
                  <span><CrmIcon name="alert" size={16} /> 409 Conflict: Someone else updated this lead. Refresh version before saving!</span>
                  <button type="button" className="btn btn-sm btn-warning" onClick={onRefresh}>
                    <CrmIcon name="refresh" size={16} /> Reload Latest Version
                  </button>
                </div>
              )}
              <div className="grid-2" style={{ gap: '12px' }}>
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
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#475569' }}>
                  DPDP Consent: {lead.dpdpConsent || lead.dpdp_consent ? 'Recorded' : 'Pending'} &bull; Optimistic Lock Version: <strong>v{lead.version || 1}</strong>
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={async () => {
                      try {
                        await apiCall(`/leads/${lead.id}/submit`, 'POST', {});
                        onShowToast('Lead submitted to Manager for verification!', 'success');
                        onRefresh();
                      } catch (err: any) {
                        onShowToast(err?.message || 'Could not submit for verification.', 'danger');
                      }
                    }}
                  >
                    <CrmIcon name="upload" size={16} /> Submit to Manager
                  </button>
                  <button type="submit" className="btn btn-primary">
                    <CrmIcon name="save" size={16} /> Save Profile (Optimistic Lock)
                  </button>
                </div>
              </div>
            </form>

            {/* Manager Lead Verification Panel (Genuine / Return with Reason / Pending Follow-up) */}
            {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
              <div
                style={{
                  marginTop: '16px',
                  background: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: '10px',
                  padding: '14px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                  <CrmIcon name="shield" size={16} /> Manager Lead Verification (Genuine vs Fake / Correction Required)
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ flex: 1, minWidth: '220px' }}
                    placeholder="Reason if returning to Counsellor (e.g. Wrong mobile / Fake info / Incomplete budget)..."
                    value={returnReasonText}
                    onChange={(e) => setReturnReasonText(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={async () => {
                      try {
                        await apiCall(`/leads/${lead.id}/verify`, 'POST', { decision: 'APPROVE' });
                        onShowToast('Lead marked GENUINE! Ready for School Shortlist & Visit.', 'success');
                        onRefresh();
                      } catch (err: any) {
                        onShowToast(err?.message || 'Verification failed.', 'danger');
                      }
                    }}
                  >
                    <CrmIcon name="check-circle" size={16} /> Mark Genuine (Approve Lead)
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={async () => {
                      if (!returnReasonText.trim()) {
                        onShowToast('Please enter a reason before returning lead to Counsellor.', 'warning');
                        return;
                      }
                      try {
                        await apiCall(`/leads/${lead.id}/verify`, 'POST', {
                          decision: 'RETURN',
                          returnRemarks: returnReasonText.trim(),
                        });
                        onShowToast('Lead returned to Counsellor with correction reason!', 'warning');
                        onRefresh();
                      } catch (err: any) {
                        onShowToast(err?.message || 'Return failed.', 'danger');
                      }
                    }}
                  >
                    <CrmIcon name="rotate-ccw" size={16} /> Return to Counsellor (With Reason)
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-warning"
                    onClick={async () => {
                      try {
                        await apiCall(`/leads/${lead.id}/verify`, 'POST', {
                          decision: 'PENDING_FOLLOWUP',
                          returnRemarks: 'Parent did not pick call — kept in Pending Follow-up (Not Fake)',
                        });
                        onShowToast('Parent did not pick call → Kept in Pending Follow-up (Not marked fake)!', 'success');
                        onRefresh();
                      } catch (err: any) {
                        onShowToast(err?.message || 'Could not set pending follow-up.', 'danger');
                      }
                    }}
                  >
                    <CrmIcon name="phone-off" size={16} /> Call Not Picked → Keep in Pending Follow-up
                  </button>
                </div>
              </div>
            )}
            </div>
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
                  <CrmIcon name="sparkles" size={16} /> Run 8-Criteria AI School Match
                </button>
                <select
                  className="form-control"
                  style={{ maxWidth: '280px' }}
                  value={addSchoolId}
                  onChange={(e) => setAddSchoolId(e.target.value)}
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
                  ))}
                </select>
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleAddShortlist(addSchoolId)}
                >
                  <CrmIcon name="plus" size={16} /> Shortlist School
                </button>
              </div>

              {suggestions.length > 0 && (
                <div style={{ marginBottom: '14px', background: '#EFF6FF', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A8A', marginBottom: '6px' }}>
                    Top Weighted Matches (Alternative School Suggestions):
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
                        <strong>{Math.round(Number(m.matchScore ?? m.match_score ?? m.score ?? 85))}%</strong>
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

              {/* Quick Add Manual School if Parent wants a different school not yet in shortlist */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px dashed #CBD5E1',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '12px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  <CrmIcon name="school" size={16} /> Parent wants another school? Add Manual School &amp; Shortlist Immediately:
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ flex: 2, minWidth: '160px' }}
                    placeholder="Manual School Name..."
                    value={manualSchoolName}
                    onChange={(e) => setManualSchoolName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="form-control"
                    style={{ flex: 1, minWidth: '110px' }}
                    placeholder="City"
                    value={manualSchoolCity}
                    onChange={(e) => setManualSchoolCity(e.target.value)}
                  />
                  <select
                    className="form-control"
                    style={{ width: '95px' }}
                    value={manualSchoolBoard}
                    onChange={(e) => setManualSchoolBoard(e.target.value)}
                  >
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE</option>
                    <option value="IB">IB</option>
                  </select>
                  <input
                    type="number"
                    className="form-control"
                    style={{ width: '115px' }}
                    placeholder="Annual Fee ₹"
                    value={manualSchoolFee}
                    onChange={(e) => setManualSchoolFee(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-navy"
                    onClick={async () => {
                      if (!manualSchoolName.trim()) {
                        onShowToast('Enter manual school name first.', 'warning');
                        return;
                      }
                      try {
                        const created = await apiCall('/schools', 'POST', {
                          name: manualSchoolName.trim(),
                          city: manualSchoolCity.trim() || 'Dehradun',
                          state: 'Uttarakhand',
                          board: manualSchoolBoard,
                          minFeeAnnual: Number(manualSchoolFee || 350000),
                          maxFeeAnnual: Number(manualSchoolFee || 350000),
                        });
                        const newId = created?.school?.id || created?.data?.id || created?.id;
                        if (newId) {
                          await handleAddShortlist(newId);
                        }
                        setManualSchoolName('');
                        onShowToast('Manual school added & shortlisted for parent!', 'success');
                        onRefresh();
                      } catch (err: any) {
                        onShowToast(err?.message || 'Could not add manual school.', 'danger');
                      }
                    }}
                  >
                    <CrmIcon name="plus" size={16} /> Add Manual School
                  </button>
                </div>
              </div>

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
                    <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
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
                  <CrmIcon name="graduation-cap" size={16} /> Apply to School
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
                      {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') ? (
                        <>
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
                            <CrmIcon name="check" size={16} /> Confirm Final Admission (Sub-Stage C → Auto Commission)
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                          <CrmIcon name="lock" size={16} /> Only Manager / Admin can confirm final admission (Sub-Stage C).
                        </span>
                      )}
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
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A8A', marginBottom: '6px' }}>
                  <CrmIcon name="zap" size={16} /> Parent Reply Quick Follow-up Reminder (1-Click):
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {[
                    { label: 'In 2 Days (+2 Days)', days: 2, reason: 'Parent replied: Call back after 2 days' },
                    { label: 'In 3 Days (+3 Days)', days: 3, reason: 'Parent replied: Call back after 3 days' },
                    { label: 'Next Week (+7 Days)', days: 7, reason: 'Parent replied: Discuss next week with family' },
                    { label: 'In 15 Days (+15 Days)', days: 15, reason: 'Parent replied: Follow up after 15 days' },
                  ].map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={async () => {
                        const targetDate = new Date(Date.now() + preset.days * 86_400_000)
                          .toISOString()
                          .slice(0, 10);
                        setNextFollowUpDate(targetDate);
                        setFollowUpReason(preset.reason);
                        try {
                          await apiCall(`/leads/${lead.id}/follow-up`, 'PUT', {
                            nextFollowUpDate: targetDate,
                            reason: preset.reason,
                          });
                          onShowToast(`Follow-up reminder set for ${targetDate} (${preset.label})!`, 'success');
                          loadDossierData();
                          onRefresh();
                        } catch (err: any) {
                          onShowToast(err?.message || 'Failed to set quick reminder.', 'danger');
                        }
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
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
                  <CrmIcon name="zap" size={16} /> Extend 90-Day Cycle
                </button>
                <button
                  className="btn btn-sm btn-warning"
                  onClick={() =>
                    onOpenReasonModal('suspend', 'Suspend Lead', 'Parent travelling abroad for 3 months...')
                  }
                >
                  <CrmIcon name="pause" size={16} /> Suspend
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
                    <CrmIcon name="lock" size={16} /> Force-Expire (360d)
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
                  <CrmIcon name="lock" size={16} /> <strong>409 Layer-3 Lock Active:</strong> {pendingBlockMsg}
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
                  <CrmIcon name="message-square" size={16} /> Open wa.me &amp; Queue Confirmation
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
                  <CrmIcon name="phone" size={16} /> Log Call Outcome
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const LEAD_CLASSES = [
  'Nursery', 'LKG', 'UKG',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6',
  'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12',
];
const LEAD_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu & Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi NCR',
  'Chandigarh',
  'Puducherry',
  'Ladakh',
  'Andaman & Nicobar Islands',
  'Dadra & Nagar Haveli and Daman & Diu',
  'Lakshadweep',
  'Other / NRI',
];
const LEAD_BUDGETS = [
  { value: 'Under ₹1L', label: 'Under ₹1L', min: 50000, max: 100000 },
  { value: '₹1L – ₹2L', label: '₹1L – ₹2L', min: 100000, max: 200000 },
  { value: '₹2L – ₹3L', label: '₹2L – ₹3L', min: 200000, max: 300000 },
  { value: '₹3L – ₹4L', label: '₹3L – ₹4L', min: 300000, max: 400000 },
  { value: '₹4L – ₹5L', label: '₹4L – ₹5L', min: 400000, max: 500000 },
  { value: '₹5L – ₹6L', label: '₹5L – ₹6L', min: 500000, max: 600000 },
  { value: '₹6L – ₹7L', label: '₹6L – ₹7L', min: 600000, max: 700000 },
  { value: '₹7L – ₹8L', label: '₹7L – ₹8L', min: 700000, max: 800000 },
  { value: '₹8L – ₹10L', label: '₹8L – ₹10L', min: 800000, max: 1000000 },
  { value: '₹10L – ₹12L', label: '₹10L – ₹12L', min: 1000000, max: 1200000 },
  { value: '₹12L – ₹15L', label: '₹12L – ₹15L', min: 1200000, max: 1500000 },
  { value: '₹15L – ₹20L', label: '₹15L – ₹20L', min: 1500000, max: 2000000 },
  { value: 'Above ₹20L', label: 'Above ₹20L', min: 2000000, max: 3000000 },
];
const LEAD_SOURCES = [
  'Call', 'WhatsApp', 'Website', 'Referral', 'Ad', 'Walk-in',
];

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
  onSuccess: (lead?: any) => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [f, setF] = useState<Record<string, string>>({
    studentName: '',
    academicYear: '2026-27',
    admissionClass: '',
    fatherName: '',
    fatherOccupation: '',
    motherName: '',
    motherOccupation: '',
    guardianName: '',
    guardianMobile: '',
    mobile: '',
    altMobile: '',
    whatsapp: '',
    email: '',
    contactTime: 'morning',
    customContactDateTime: '',
    board: 'CBSE',
    schoolType: 'boarding',
    cityResident: '',
    cityPreferred: '',
    state: 'Uttarakhand',
    budget: '₹3L – ₹4L',
    customBudget: '₹3L – ₹4L',
    studentGender: 'male',
    schoolGenderPref: 'co_ed',
    prevClassPct: '',
    source: 'Call',
    sourceDetail: '',
    remark: '',
  });
  const [dpdpConsent, setDpdpConsent] = useState(false);
  const [dupWarning, setDupWarning] = useState<any>(null);
  const [expiredMatch, setExpiredMatch] = useState<any>(null);
  const [allowCreateNewAfterExpiry, setAllowCreateNewAfterExpiry] = useState(false);
  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState<{
    id?: string;
    leadNumber?: string;
    studentName?: string;
    parentPhone?: string;
    counsellor?: string;
  } | null>(null);
  const [emailAlreadyRegistered, setEmailAlreadyRegistered] = useState<{
    id?: string;
    leadNumber?: string;
    studentName?: string;
    parentEmail?: string;
    counsellor?: string;
  } | null>(null);
  const [phoneFormatError, setPhoneFormatError] = useState<string | null>(null);
  const [emailFormatError, setEmailFormatError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState('sec-student');

  if (!isOpen) return null;

  const isFakeIndianMobile = (digits10: string) => {
    if (!/^[6-9]\d{9}$/.test(digits10)) return true;
    if (/^(\d)\1{9}$/.test(digits10)) return true;
    if (/^(\d)\1{6,}/.test(digits10) || /(\d)\1{6,}$/.test(digits10)) return true;
    return [
      '9876543210',
      '9123456789',
      '8765432109',
      '7654321098',
      '6543210987',
      '9012345678',
      '9000000000',
      '8000000000',
      '7000000000',
      '6000000000',
    ].includes(digits10);
  };

  const isFakeEmail = (rawEmail: string) => {
    const clean = rawEmail.trim().toLowerCase();
    if (!clean) return false;
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) return true;
    const [localPart, domain] = clean.split('@');
    const blockedDomains = [
      'test.com',
      'example.com',
      'fake.com',
      'dummy.com',
      'abc.com',
      'xyz.com',
      'mailinator.com',
      'tempmail.com',
      '10minutemail.com',
      'yopmail.com',
    ];
    const blockedLocals = ['test', 'dummy', 'fake', 'asdf', 'qwerty', '12345', '123456', 'abc', 'xyz'];
    return (
      blockedDomains.includes(domain) ||
      blockedLocals.includes(localPart) ||
      /^([a-z0-9])\1{4,}$/.test(localPart)
    );
  };

  const set = (k: string) => (e: React.ChangeEvent<any>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const goSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const runDuplicateAndExpiredChecks = async () => {
    const rawMobile = f.mobile.replace(/\D/g, '');
    const rawEmail = f.email.trim().toLowerCase();
    if (rawMobile.length < 10 && !rawEmail) {
      setPhoneAlreadyRegistered(null);
      setEmailAlreadyRegistered(null);
      setDupWarning(null);
      return;
    }
    try {
      const [dRes, eRes] = await Promise.all([
        apiCall('/leads/check-duplicate', 'POST', {
          mobile: f.mobile.trim(),
          email: rawEmail || undefined,
          studentName: f.studentName.trim(),
          classGrade: f.admissionClass,
        }).catch(() => null),
        rawMobile.length >= 10
          ? apiCall('/leads/check-expired-match', 'POST', {
              mobile: f.mobile.trim(),
              studentName: f.studentName.trim(),
              classGrade: f.admissionClass,
              admissionClass: f.admissionClass,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const exp =
        eRes?.expiredLead ||
        eRes?.expired_lead ||
        eRes?.match ||
        eRes?.data?.expiredLead ||
        eRes?.data?.expired_lead ||
        null;
      setExpiredMatch(exp);
      const dups = dRes?.duplicates || dRes?.matches || dRes?.data?.duplicates || dRes?.data?.matches || [];
      const matched = dRes?.phoneMatchedLead || (Array.isArray(dups) && rawMobile.length >= 10
        ? dups.find((m: any) => (m.parentPhone || '').replace(/\D/g, '').slice(-10) === rawMobile.slice(-10))
        : null);
      if ((dRes?.phoneAlreadyExists || matched) && !exp) {
        setPhoneAlreadyRegistered(matched || { leadNumber: 'LD-EXISTING', studentName: 'Registered Student' });
      } else {
        setPhoneAlreadyRegistered(null);
      }
      if (dRes?.emailAlreadyExists && dRes?.emailMatchedLead) {
        setEmailAlreadyRegistered(dRes.emailMatchedLead);
      } else if (!rawEmail) {
        setEmailAlreadyRegistered(null);
      }
      setDupWarning(Array.isArray(dups) && dups.length > 0 ? dups[0] : null);
    } catch {
      // ignore pre-check errors
    }
  };

  const resetForm = () => {
    setF((p) => ({
      ...p,
      studentName: '', admissionClass: '', fatherName: '', fatherOccupation: '',
      motherName: '', motherOccupation: '', guardianName: '', guardianMobile: '',
      mobile: '', altMobile: '', whatsapp: '', email: '', cityResident: '',
      cityPreferred: '', prevClassPct: '', sourceDetail: '', remark: '',
      contactTime: 'morning', customContactDateTime: '',
      budget: '₹3L – ₹4L', customBudget: '₹3L – ₹4L',
    }));
    setDpdpConsent(false);
    setDupWarning(null);
    setExpiredMatch(null);
    setPhoneAlreadyRegistered(null);
    setEmailAlreadyRegistered(null);
    setPhoneFormatError(null);
    setEmailFormatError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tenDigits = f.mobile.replace(/\D/g, '').slice(-10);
    if (tenDigits.length !== 10 || isFakeIndianMobile(tenDigits)) {
      const errMsg = 'Kripya ek real 10-digit Indian mobile number enter karein (starting with 6, 7, 8, or 9; dummy numbers allowed nahi hain).';
      setPhoneFormatError(errMsg);
      onShowToast(errMsg, 'danger');
      return;
    }
    if (f.email.trim() && isFakeEmail(f.email.trim())) {
      const errMsg = 'Kripya ek real aur valid email address enter karein (fake/test email allowed nahi hai).';
      setEmailFormatError(errMsg);
      onShowToast(errMsg, 'danger');
      return;
    }
    if (phoneAlreadyRegistered) {
      onShowToast(
        `Ye mobile number pehle se registered hai! (Lead ID: ${
          phoneAlreadyRegistered.leadNumber || 'Existing'
        }${phoneAlreadyRegistered.studentName ? `, Student: "${phoneAlreadyRegistered.studentName}"` : ''}). Same mobile number dobara submit nahi ho sakta.`,
        'danger'
      );
      return;
    }
    if (emailAlreadyRegistered) {
      onShowToast(
        `Ye email address pehle se registered hai! (Lead ID: ${
          emailAlreadyRegistered.leadNumber || 'Existing'
        }${emailAlreadyRegistered.studentName ? `, Student: "${emailAlreadyRegistered.studentName}"` : ''}). Kripya unique email enter karein.`,
        'danger'
      );
      return;
    }
    if (!dpdpConsent) {
      onShowToast('DPDP parent data consent checkbox is required.', 'warning');
      return;
    }

    const rawBudgetString = (f.customBudget || f.budget || '').trim();
    const matchedPreset = LEAD_BUDGETS.find((b) => b.value === rawBudgetString || b.label === rawBudgetString);
    let budgetMin = 200000;
    let budgetMax = 300000;
    if (matchedPreset && matchedPreset.value !== 'custom') {
      budgetMin = matchedPreset.min;
      budgetMax = matchedPreset.max;
    } else if (rawBudgetString) {
      const cleanNums = rawBudgetString.replace(/,/g, '');
      const lakhMatch = cleanNums.match(/(\d+(\.\d+)?)\s*(l|lac|lakh)/i);
      const pureNumMatch = cleanNums.match(/\d{4,8}/);
      if (lakhMatch) {
        const val = parseFloat(lakhMatch[1]) * 100000;
        budgetMin = Math.round(val * 0.9);
        budgetMax = Math.round(val * 1.1);
      } else if (pureNumMatch) {
        const val = parseInt(pureNumMatch[0], 10);
        budgetMin = Math.round(val * 0.9);
        budgetMax = Math.round(val * 1.1);
      }
    }
    const resolvedBudgetLabel = rawBudgetString || '₹3L – ₹4L';

    setSubmitting(true);
    try {
      const res = await apiCall('/leads', 'POST', {
        studentName: f.studentName.trim(),
        academicYear: f.academicYear.trim() || '2026-27',
        admissionClass: f.admissionClass,
        applyingForGrade: f.admissionClass,
        fatherName: f.fatherName.trim() || undefined,
        fatherOccupation: f.fatherOccupation.trim() || undefined,
        motherName: f.motherName.trim() || undefined,
        motherOccupation: f.motherOccupation.trim() || undefined,
        guardianName: f.guardianName.trim() || undefined,
        guardianMobile: f.guardianMobile.trim() || undefined,
        parentName: f.fatherName.trim() || f.motherName.trim() || f.guardianName.trim() || undefined,
        mobile: f.mobile.trim(),
        fatherPhone: f.mobile.trim(),
        alternateMobile: f.altMobile.trim() || undefined,
        whatsappNumber: f.whatsapp.trim() || undefined,
        email: f.email.trim() || undefined,
        parentEmail: f.email.trim() || undefined,
        preferredContactTime:
          f.contactTime === 'custom'
            ? f.customContactDateTime.trim() || 'Custom Date & Time'
            : f.contactTime,
        board: f.board,
        preferredBoard: f.board,
        schoolType: f.schoolType,
        city: f.cityResident.trim() || undefined,
        preferredLocation: f.cityPreferred.trim() || f.state,
        state: f.state,
        budget_range: resolvedBudgetLabel,
        annualBudget: resolvedBudgetLabel,
        budgetMin,
        budgetMax,
        gender: f.studentGender,
        studentGender: f.studentGender,
        schoolGenderPref: f.schoolGenderPref,
        previousClassPercentage: f.prevClassPct.trim() || undefined,
        leadSource: f.source,
        sourceDetail: f.sourceDetail.trim() || undefined,
        initial_remark: f.remark.trim() || undefined,
        dpdpConsent,
        allowCreateNewAfterExpiry: allowCreateNewAfterExpiry || Boolean(expiredMatch),
      });
      const createdLead = res?.lead || res?.data?.lead || res?.data || {
        studentName: f.studentName.trim(),
        admissionClass: f.admissionClass,
        fatherName: f.fatherName.trim(),
        motherName: f.motherName.trim(),
        mobile: f.mobile.trim(),
        fatherPhone: f.mobile.trim(),
        alternateMobile: f.altMobile.trim(),
        email: f.email.trim(),
        annualBudget: resolvedBudgetLabel,
        budget_range: resolvedBudgetLabel,
        score: 85,
      };
      onShowToast(
        `Lead "${f.studentName}" submitted & verified! Opening Student Report for Call/WhatsApp.`,
        'success'
      );
      resetForm();
      onSuccess(createdLead);
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

  const grid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '12px',
  };
  const secTitle: React.CSSProperties = {
    fontSize: '12.5px',
    fontWeight: 800,
    color: '#123B70',
    margin: '16px 0 8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  };
  const tabs: Array<[string, string, string]> = [
    ['sec-student', 'Student & Family', 'users'],
    ['sec-academic', 'Academic', 'graduation-cap'],
    ['sec-contact', 'Contact', 'phone'],
    ['sec-source', 'Source', 'target'],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '900px', width: '96vw' }}
      >
        <div className="modal-header">
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
            <CrmIcon name="plus" size={16} /> Create Student & Parent Lead
          </h3>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose}>
            <CrmIcon name="x" size={16} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '8px 16px',
            borderBottom: '1px solid #E2E8F0',
            overflowX: 'auto',
          }}
        >
          {tabs.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => goSection(id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: 'none',
                background: activeSection === id ? '#EFF6FF' : 'transparent',
                color: activeSection === id ? '#1D4ED8' : '#475569',
                fontWeight: 700,
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <CrmIcon name={icon} size={14} /> {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
            {phoneAlreadyRegistered && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1.5px solid #EF4444',
                  color: '#991B1B',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <CrmIcon name="alert" size={20} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13px' }}>
                    ⛔ Ye Mobile Number pehle se registered hai! (This phone number already exists)
                  </div>
                  <div style={{ marginTop: '2px', lineHeight: '1.4' }}>
                    Ye mobile number pehle se database me darj hai: Lead ID <strong>{phoneAlreadyRegistered.leadNumber}</strong>
                    {phoneAlreadyRegistered.studentName && <> (Student: <strong>{phoneAlreadyRegistered.studentName}</strong>)</>}
                    {phoneAlreadyRegistered.counsellor && <> — Counsellor: <strong>{phoneAlreadyRegistered.counsellor}</strong></>}.
                    <br />
                    Same mobile number se dobara lead submit nahi ho sakti.
                  </div>
                </div>
              </div>
            )}
            {emailAlreadyRegistered && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1.5px solid #EF4444',
                  color: '#991B1B',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <CrmIcon name="alert" size={20} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13px' }}>
                    ⛔ Ye Email Address pehle se registered hai! (This email already exists)
                  </div>
                  <div style={{ marginTop: '2px', lineHeight: '1.4' }}>
                    Ye email address pehle se database me darj hai: Lead ID <strong>{emailAlreadyRegistered.leadNumber}</strong>
                    {emailAlreadyRegistered.studentName && <> (Student: <strong>{emailAlreadyRegistered.studentName}</strong>)</>}
                    {emailAlreadyRegistered.counsellor && <> — Counsellor: <strong>{emailAlreadyRegistered.counsellor}</strong></>}.
                    <br />
                    Har parent/student ka email real aur unique hona chahiye.
                  </div>
                </div>
              </div>
            )}
            {dupWarning && !phoneAlreadyRegistered && (
              <div
                style={{
                  background: '#FFFBEB', border: '1px solid #F59E0B', color: '#92400E',
                  padding: '10px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px',
                }}
              >
                <CrmIcon name="alert" size={16} /> Possible duplicate found:{' '}
                <strong>{dupWarning.studentName}</strong> ({dupWarning.leadNumber})
              </div>
            )}
            {expiredMatch && (
              <div
                style={{
                  background: '#EFF6FF', border: '1.5px solid #3B82F6', color: '#1E3A8A',
                  padding: '12px 14px', borderRadius: '10px', fontSize: '12.5px', marginBottom: '12px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {expiredMatch.forceExpired || expiredMatch.force_expired
                      ? `This lead [${expiredMatch.leadNumber || expiredMatch.lead_id || ''}] was Force-Expired (Day 360). Please create a new lead.`
                      : `This lead was expired [${expiredMatch.leadNumber || expiredMatch.lead_id || ''}] – ${expiredMatch.daysAgo ?? expiredMatch.days_ago ?? 90} days ago. Reopen?`}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#334155', marginTop: '2px' }}>
                    Choose whether to reopen the existing lead (same ID, remarks preserved) or create a brand-new lead.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {!(expiredMatch.forceExpired || expiredMatch.force_expired) && (
                    <button type="button" className="btn btn-sm btn-primary" onClick={handleReopenExpiredMatch}>
                      Reopen (Same ID)
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setAllowCreateNewAfterExpiry(true);
                      setPhoneAlreadyRegistered(null);
                      setExpiredMatch(null);
                      onShowToast('Proceeding to create a new lead record.', 'warning');
                    }}
                  >
                    Create New
                  </button>
                </div>
              </div>
            )}

            {/* STUDENT & FAMILY */}
            <div id="sec-student" style={{ ...secTitle, marginTop: 0 }}>
              <CrmIcon name="users" size={14} /> Section 1 — Student & Family
            </div>
            <div style={grid}>
              <div className="form-group">
                <label className="form-label">Student Name *</label>
                <input className="form-control" required value={f.studentName} onChange={set('studentName')} onBlur={runDuplicateAndExpiredChecks} placeholder="e.g. Aarav Rawat" />
              </div>
              <div className="form-group">
                <label className="form-label">Academic Year *</label>
                <select className="form-control" value={f.academicYear} onChange={set('academicYear')}>
                  {['2025-26', '2026-27', '2027-28', '2028-29'].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Class / Grade *</label>
                <select className="form-control" required value={f.admissionClass} onChange={set('admissionClass')} onBlur={runDuplicateAndExpiredChecks}>
                  <option value="">Select</option>
                  {LEAD_CLASSES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Father's Name</label>
                <input className="form-control" value={f.fatherName} onChange={set('fatherName')} />
              </div>
              <div className="form-group">
                <label className="form-label">Father's Occupation</label>
                <input className="form-control" value={f.fatherOccupation} onChange={set('fatherOccupation')} />
              </div>
              <div className="form-group">
                <label className="form-label">Mother's Name</label>
                <input className="form-control" value={f.motherName} onChange={set('motherName')} />
              </div>
              <div className="form-group">
                <label className="form-label">Mother's Occupation</label>
                <input className="form-control" value={f.motherOccupation} onChange={set('motherOccupation')} />
              </div>
              <div className="form-group">
                <label className="form-label">Guardian Name</label>
                <input className="form-control" value={f.guardianName} onChange={set('guardianName')} />
              </div>
              <div className="form-group">
                <label className="form-label">Guardian Mobile</label>
                <input className="form-control" inputMode="tel" value={f.guardianMobile} onChange={set('guardianMobile')} />
              </div>
            </div>

            {/* CONTACT */}
            <div id="sec-contact" style={secTitle}>
              <CrmIcon name="phone" size={14} /> Contact
            </div>
            <div style={grid}>
              <div className="form-group">
                <label className="form-label">
                  Mobile Primary (+91) *
                  {phoneAlreadyRegistered && (
                    <span style={{ color: '#DC2626', marginLeft: '6px', fontWeight: 700, fontSize: '11px' }}>
                      (⚠️ Pehle se registered hai)
                    </span>
                  )}
                  {phoneFormatError && !phoneAlreadyRegistered && (
                    <span style={{ color: '#DC2626', marginLeft: '6px', fontWeight: 700, fontSize: '11px' }}>
                      (⚠️ Invalid / Fake Number)
                    </span>
                  )}
                </label>
                <input
                  className="form-control"
                  required
                  inputMode="tel"
                  maxLength={13}
                  placeholder="Enter real 10-digit mobile number"
                  value={f.mobile}
                  onChange={(e) => {
                    set('mobile')(e);
                    const digits = e.target.value.replace(/\D/g, '');
                    if (digits.length >= 10) {
                      const ten = digits.slice(-10);
                      if (isFakeIndianMobile(ten)) {
                        setPhoneFormatError('Fake ya dummy mobile number allowed nahi hai. Real 10-digit number likhein.');
                        setPhoneAlreadyRegistered(null);
                        return;
                      }
                      setPhoneFormatError(null);
                      apiCall('/leads/check-duplicate', 'POST', { mobile: e.target.value })
                        .then((res) => {
                          if (res?.phoneAlreadyExists && res?.phoneMatchedLead) {
                            setPhoneAlreadyRegistered(res.phoneMatchedLead);
                          } else {
                            setPhoneAlreadyRegistered(null);
                          }
                        })
                        .catch(() => {});
                    } else {
                      setPhoneAlreadyRegistered(null);
                      setPhoneFormatError(null);
                    }
                  }}
                  onBlur={runDuplicateAndExpiredChecks}
                  style={{
                    borderColor: phoneAlreadyRegistered || phoneFormatError ? '#EF4444' : undefined,
                    backgroundColor: phoneAlreadyRegistered || phoneFormatError ? '#FEF2F2' : undefined,
                  }}
                />
                {phoneAlreadyRegistered && (
                  <div style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', fontWeight: 600 }}>
                    ⚠️ Ye mobile number pehle se likha/registered hai: Lead ID {phoneAlreadyRegistered.leadNumber} ({phoneAlreadyRegistered.studentName})
                  </div>
                )}
                {phoneFormatError && !phoneAlreadyRegistered && (
                  <div style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', fontWeight: 600 }}>
                    ⚠️ {phoneFormatError}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Alt</label>
                <input className="form-control" inputMode="tel" value={f.altMobile} onChange={set('altMobile')} />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp Number</label>
                <input className="form-control" inputMode="tel" placeholder="Same as primary if empty" value={f.whatsapp} onChange={set('whatsapp')} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Email *
                  {emailAlreadyRegistered && (
                    <span style={{ color: '#DC2626', marginLeft: '6px', fontWeight: 700, fontSize: '11px' }}>
                      (⚠️ Pehle se registered hai)
                    </span>
                  )}
                  {emailFormatError && !emailAlreadyRegistered && (
                    <span style={{ color: '#DC2626', marginLeft: '6px', fontWeight: 700, fontSize: '11px' }}>
                      (⚠️ Invalid / Fake Email)
                    </span>
                  )}
                </label>
                <input
                  className="form-control"
                  type="email"
                  required
                  placeholder="Enter real & unique email address"
                  value={f.email}
                  onChange={(e) => {
                    set('email')(e);
                    const val = e.target.value.trim().toLowerCase();
                    if (!val) {
                      setEmailAlreadyRegistered(null);
                      setEmailFormatError(null);
                      return;
                    }
                    if (val.includes('@') && val.includes('.')) {
                      if (isFakeEmail(val)) {
                        setEmailFormatError('Fake ya test email allowed nahi hai. Real email enter karein.');
                        setEmailAlreadyRegistered(null);
                        return;
                      }
                      setEmailFormatError(null);
                      apiCall('/leads/check-duplicate', 'POST', { email: val })
                        .then((res) => {
                          if (res?.emailAlreadyExists && res?.emailMatchedLead) {
                            setEmailAlreadyRegistered(res.emailMatchedLead);
                          } else {
                            setEmailAlreadyRegistered(null);
                          }
                        })
                        .catch(() => {});
                    } else {
                      setEmailAlreadyRegistered(null);
                    }
                  }}
                  onBlur={runDuplicateAndExpiredChecks}
                  style={{
                    borderColor: emailAlreadyRegistered || emailFormatError ? '#EF4444' : undefined,
                    backgroundColor: emailAlreadyRegistered || emailFormatError ? '#FEF2F2' : undefined,
                  }}
                />
                {emailAlreadyRegistered && (
                  <div style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', fontWeight: 600 }}>
                    ⚠️ Ye email address pehle se registered hai: Lead ID {emailAlreadyRegistered.leadNumber} ({emailAlreadyRegistered.studentName})
                  </div>
                )}
                {emailFormatError && !emailAlreadyRegistered && (
                  <div style={{ color: '#DC2626', fontSize: '11px', marginTop: '4px', fontWeight: 600 }}>
                    ⚠️ {emailFormatError}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Preferred Contact Time</label>
                <select className="form-control" value={f.contactTime} onChange={set('contactTime')}>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="anytime">Anytime</option>
                  <option value="custom">Custom Date &amp; Time (Manual)</option>
                </select>
                {f.contactTime === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    <input
                      type="datetime-local"
                      className="form-control"
                      onChange={(e) => {
                        if (e.target.value) {
                          const formatted = new Date(e.target.value).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          });
                          setF((p) => ({ ...p, customContactDateTime: formatted }));
                        }
                      }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Or type date & time manually (e.g. 25 Nov, 4:30 PM)"
                      value={f.customContactDateTime}
                      onChange={set('customContactDateTime')}
                    />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">State *</label>
                <select className="form-control" value={f.state} onChange={set('state')}>
                  {LEAD_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">City Resident</label>
                <input className="form-control" value={f.cityResident} onChange={set('cityResident')} />
              </div>
              <div className="form-group">
                <label className="form-label">City Preferred</label>
                <input className="form-control" value={f.cityPreferred} onChange={set('cityPreferred')} />
              </div>
            </div>

            {/* ACADEMIC */}
            <div id="sec-academic" style={secTitle}>
              <CrmIcon name="graduation-cap" size={14} /> Academic & Preferences
            </div>
            <div style={grid}>
              <div className="form-group">
                <label className="form-label">Board *</label>
                <select className="form-control" value={f.board} onChange={set('board')}>
                  {['CBSE', 'ICSE', 'IB', 'IGCSE', 'State Board'].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">School Type *</label>
                <select className="form-control" value={f.schoolType} onChange={set('schoolType')}>
                  <option value="boarding">Boarding</option>
                  <option value="day_boarding">Day-Boarding</option>
                  <option value="day">Day School</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Annual Fees / Budget (₹) *</label>
                <select
                  className="form-control"
                  value={f.budget}
                  onChange={(e) => {
                    const val = e.target.value;
                    setF((prev) => ({ ...prev, budget: val, customBudget: val }));
                  }}
                  required
                >
                  {LEAD_BUDGETS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Student Gender</label>
                <select className="form-control" value={f.studentGender} onChange={set('studentGender')}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">School Gender Preference *</label>
                <select className="form-control" value={f.schoolGenderPref} onChange={set('schoolGenderPref')}>
                  <option value="co_ed">Co-Ed (Both Boys & Girls)</option>
                  <option value="boys">Boys Only</option>
                  <option value="girls">Girls Only</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Previous Class %</label>
                <input className="form-control" inputMode="decimal" placeholder="e.g. 85" value={f.prevClassPct} onChange={set('prevClassPct')} />
              </div>
            </div>

            {/* SOURCE */}
            <div id="sec-source" style={secTitle}>
              <CrmIcon name="target" size={14} /> Source
            </div>
            <div style={grid}>
              <div className="form-group">
                <label className="form-label">Source *</label>
                <select className="form-control" value={f.source} onChange={set('source')}>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Source Detail (Referral name / Campaign)</label>
                <input className="form-control" value={f.sourceDetail} onChange={set('sourceDetail')} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Initial Remark</label>
              <textarea className="form-control" rows={3} value={f.remark} onChange={set('remark')} />
            </div>

            <label
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px',
                marginTop: '10px', background: '#ECFDF5', border: '1px solid #A7F3D0',
                padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={dpdpConsent} onChange={(e) => setDpdpConsent(e.target.checked)} />
              <span>I confirm parent consent for data storage (DPDP) *</span>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                submitting ||
                !!phoneAlreadyRegistered ||
                !!emailAlreadyRegistered ||
                !!phoneFormatError ||
                !!emailFormatError
              }
              style={{
                opacity:
                  phoneAlreadyRegistered ||
                  emailAlreadyRegistered ||
                  phoneFormatError ||
                  emailFormatError
                    ? 0.6
                    : 1,
                cursor:
                  phoneAlreadyRegistered ||
                  emailAlreadyRegistered ||
                  phoneFormatError ||
                  emailFormatError
                    ? 'not-allowed'
                    : 'pointer',
                background:
                  phoneAlreadyRegistered ||
                  emailAlreadyRegistered ||
                  phoneFormatError ||
                  emailFormatError
                    ? '#DC2626'
                    : undefined,
                borderColor:
                  phoneAlreadyRegistered ||
                  emailAlreadyRegistered ||
                  phoneFormatError ||
                  emailFormatError
                    ? '#DC2626'
                    : undefined,
              }}
            >
              {phoneAlreadyRegistered
                ? '⛔ Ye Number Pehle Se Registered Hai (Cannot Submit)'
                : emailAlreadyRegistered
                ? '⛔ Ye Email Pehle Se Registered Hai (Cannot Submit)'
                : phoneFormatError || emailFormatError
                ? '⛔ Enter Real Mobile & Email (Cannot Submit)'
                : submitting
                ? 'Creating Lead...'
                : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
