import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiCall } from '../../lib/api';
import { normalizeRoleKey } from '../../lib/roles';

interface RoleDashboardProps {
  onNavigateTab: (tab: string) => void;
  onOpenNewLead: () => void;
  leads?: any[];
  commissions?: any[];
  schools?: any[];
  teams?: any[];
  kpiStats?: any;
}

export default function RoleDashboard({
  onNavigateTab,
  onOpenNewLead,
  leads = [],
  commissions = [],
  schools = [],
  teams = [],
  kpiStats = {},
}: RoleDashboardProps) {
  const { user, previewRole } = useAuthStore();
  const effectiveRole = previewRole || user?.role || 'SUPER_ADMIN';
  const normKey = normalizeRoleKey(effectiveRole);
  const role: 'admin' | 'manager' | 'counsellor' =
    normKey === 'super_admin' ? 'admin' : normKey === 'manager' ? 'manager' : 'counsellor';

  const [toastMsg, setToastMsg] = useState<{
    text: string;
    type: 'success' | 'warning' | 'danger';
  } | null>(null);

  // Live role-scoped dashboard payloads
  const [jrData, setJrData] = useState<any>(null);
  const [srData, setSrData] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [pendingQueue, setPendingQueue] = useState<any[]>([]);
  const [callOutcomes, setCallOutcomes] = useState<string[]>([
    'Connected - Interested',
    'Connected - Needs Callback',
    'Ringing / No Answer',
    'Switched Off / Not Reachable',
    'Call Busy',
    'Not Interested',
    'Wrong Number',
  ]);
  const [loadingDash, setLoadingDash] = useState(false);

  // Call & WA logging modals
  const [selectedLeadForCall, setSelectedLeadForCall] = useState<any | null>(null);
  const [callWhom, setCallWhom] = useState<'father' | 'mother'>('father');
  const [callOutcome, setCallOutcome] = useState('Connected - Interested');
  const [callIntent, setCallIntent] = useState<'GENUINE' | 'JUNK'>('GENUINE');
  const [callNotes, setCallNotes] = useState('');

  // Pending Logging Queue Resolution Modal (3-Layer Lock)
  const [resolvingItem, setResolvingItem] = useState<any | null>(null);
  const [resolveStatus, setResolveStatus] = useState('sent');
  const [resolveOutcome, setResolveOutcome] = useState('Spoke with parent / shared school details');
  const [resolveNotes, setResolveNotes] = useState('');

  // Manager / Admin interactive modals
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'weekly' | 'monthly'>('monthly');
  const [showFollowUpModal, setShowFollowUpModal] = useState<any | null>(null);
  const [newFollowUpDate, setNewFollowUpDate] = useState(
    new Date(Date.now() + 86_400_000).toISOString().split('T')[0]
  );
  const [followUpReason, setFollowUpReason] = useState('');

  const [showBrochureModal, setShowBrochureModal] = useState<any | null>(null);
  const [brochureText, setBrochureText] = useState('');
  const [showReassignModal, setShowReassignModal] = useState<any | null>(null);
  const [targetTeamId, setTargetTeamId] = useState('');

  const showToast = (text: string, type: 'success' | 'warning' | 'danger' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchDashboardData = async () => {
    setLoadingDash(true);
    try {
      const [queueRes, outcomesRes] = await Promise.all([
        apiCall('/pending-logging-queue').catch(() => ({ items: [] })),
        apiCall('/calls/outcomes').catch(() => ({ outcomes: [] })),
      ]);
      const qList = queueRes?.items || queueRes?.queue || queueRes?.data?.items || [];
      setPendingQueue(Array.isArray(qList) ? qList : []);
      if (Array.isArray(outcomesRes?.outcomes) && outcomesRes.outcomes.length > 0) {
        setCallOutcomes(outcomesRes.outcomes);
      }

      if (role === 'admin') {
        const res = await apiCall('/dashboard/admin').catch(() => null);
        setAdminData(res?.data || res);
      } else if (role === 'manager') {
        const res = await apiCall('/dashboard/sr').catch(() => null);
        setSrData(res?.data || res);
      } else {
        const res = await apiCall('/dashboard/jr').catch(() => null);
        setJrData(res?.data || res);
      }
    } finally {
      setLoadingDash(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [role]);

  // Derived aggregates from live collections + role API
  const pendingVerifyCount = leads.filter(
    (l) => String(l.verificationStatus || l.status || '').toLowerCase() === 'pending'
  ).length;
  const approvedLeadsCount = leads.filter((l) =>
    ['verified', 'qualified', 'shortlisted', 'enrolled', 'admission_done'].includes(
      String(l.status || '').toLowerCase()
    )
  ).length;
  const campusVisitsCount = leads.filter((l) =>
    ['application_submitted', 'entrance_scheduled', 'interview_scheduled'].includes(
      String(l.stage || l.current_stage || '').toLowerCase()
    )
  ).length;

  const activeCommissions = commissions.filter(
    (c) => !c.isReversal && !['reversed', 'REVERSED', 'CANCELLED'].includes(c.status)
  );
  const totalCommAmount = activeCommissions.reduce((s, c) => s + Number(c.amount || 0), 0);
  const paidCommAmount = activeCommissions
    .filter((c) => ['received', 'paid_out', 'PAID', 'APPROVED'].includes(c.status))
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  const recentLeadsList = (jrData?.recentLeads && jrData.recentLeads.length > 0
    ? jrData.recentLeads
    : leads
  ).slice(0, 8);

  const handleOpenCallLogger = async (lead: any) => {
    setSelectedLeadForCall(lead);
    setCallWhom('father');
    setCallOutcome(callOutcomes[0] || 'Connected - Interested');
    setCallIntent('GENUINE');
    setCallNotes('');
    try {
      await apiCall(`/calls/dial-link/${lead.id}`);
      window.dispatchEvent(new CustomEvent('crm-logging-queue-updated'));
    } catch (err: any) {
      if (err?.status === 409) {
        showToast(err.message || 'Please resolve your pending logging queue item first!', 'warning');
      }
    }
  };

  const handleSaveCallFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadForCall) return;
    try {
      const targetPhone =
        callWhom === 'father'
          ? selectedLeadForCall.fatherPhone || selectedLeadForCall.mobile || ''
          : selectedLeadForCall.motherPhone || selectedLeadForCall.fatherPhone || '';
      await apiCall('/calls/log', 'POST', {
        lead_id: selectedLeadForCall.id,
        leadId: selectedLeadForCall.id,
        parentWhom: callWhom,
        phone: targetPhone,
        outcome: callOutcome,
        notes: `${callIntent === 'GENUINE' ? '[GENUINE] ' : '[JUNK] '}${callNotes}`,
      });
      showToast(`Call outcome saved for ${selectedLeadForCall.studentName}.`, 'success');
      setSelectedLeadForCall(null);
      window.dispatchEvent(new CustomEvent('crm-logging-queue-updated'));
      await fetchDashboardData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to log call feedback.', 'danger');
    }
  };

  const handleOpenWhatsAppQuick = (lead: any) => {
    const school = schools[0]?.name || 'Dehradun / Mussoorie Boarding School';
    setShowBrochureModal(lead);
    setBrochureText(
      `Namaste ${lead.fatherName || lead.parentName || 'Parent'}! Sharing admission prospectus & fee details for ${lead.studentName || 'your child'} (${lead.admissionClass || 'Boarding'}) - ${school}.`
    );
  };

  const handleSendWhatsAppQuick = async () => {
    if (!showBrochureModal) return;
    try {
      const res = await apiCall('/whatsapp/generate-link', 'POST', {
        lead_id: showBrochureModal.id,
        leadId: showBrochureModal.id,
        message: brochureText.trim(),
      });
      const waUrl = res?.waUrl || res?.url || res?.data?.waUrl;
      if (waUrl) window.open(waUrl, '_blank', 'noopener,noreferrer');
      showToast('WhatsApp link generated & queued in Layer-3 confirmation tracker!', 'success');
      setShowBrochureModal(null);
      window.dispatchEvent(new CustomEvent('crm-logging-queue-updated'));
      await fetchDashboardData();
    } catch (err: any) {
      if (err?.status === 409) {
        showToast(
          err.message || 'Unlogged WhatsApp/Call pending for another lead. Confirm it first!',
          'warning'
        );
      } else {
        showToast(err?.message || 'Could not generate WhatsApp link.', 'danger');
      }
    }
  };

  const handleResolveQueueItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingItem) return;
    try {
      await apiCall(`/pending-logging-queue/${resolvingItem.id}/resolve`, 'POST', {
        confirmed: true,
        status: resolveStatus,
        outcome: resolveOutcome,
        notes: resolveNotes || resolveOutcome,
      });
      showToast('Pending activity resolved & Layer-3 lock cleared!', 'success');
      setResolvingItem(null);
      setResolveNotes('');
      window.dispatchEvent(new CustomEvent('crm-logging-queue-updated'));
      await fetchDashboardData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to resolve queue item.', 'danger');
    }
  };

  const handleRescheduleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showFollowUpModal) return;
    if (followUpReason.trim().length < 5) {
      showToast('Reason must be at least 5 characters.', 'warning');
      return;
    }
    try {
      await apiCall(`/leads/${showFollowUpModal.id}/follow-up`, 'PUT', {
        nextFollowUpDate: newFollowUpDate,
        reason: followUpReason.trim(),
      });
      showToast(`Follow-up date updated for ${showFollowUpModal.studentName}!`, 'success');
      setShowFollowUpModal(null);
      setFollowUpReason('');
      await fetchDashboardData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update follow-up date.', 'danger');
    }
  };

  const handleReassignUserTeam = async () => {
    if (!showReassignModal || !targetTeamId) return;
    try {
      await apiCall(`/users/${showReassignModal.id}/role`, 'PATCH', {
        teamId: targetTeamId,
        reason: 'Dashboard shift monitor reassignment',
      });
      showToast(`${showReassignModal.fullName || 'Employee'} team updated cleanly.`, 'success');
      setShowReassignModal(null);
      await fetchDashboardData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to reassign employee team.', 'danger');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {toastMsg && (
        <div
          className={`toast ${toastMsg.type}`}
          style={{ position: 'fixed', top: '70px', right: '20px', zIndex: 2000 }}
        >
          <span>{toastMsg.type === 'success' ? '✅' : toastMsg.type === 'danger' ? '❌' : '⚠️'}</span>{' '}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Layer-3 Pending Logging Queue Alert Strip */}
      {pendingQueue.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: '20px',
            borderColor: '#F59E0B',
            background: '#FFFBEB',
            padding: '14px 18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 800,
                  color: '#92400E',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                ⏳ Layer-3 Activity Confirmation Required ({pendingQueue.length} Pending)
              </div>
              <div style={{ fontSize: '12.5px', color: '#B45309', marginTop: '2px' }}>
                Lead: <strong>{pendingQueue[0]?.lead?.studentName || 'Student'}</strong> (
                {pendingQueue[0]?.lead?.leadNumber || 'CRM Lead'}) via{' '}
                <strong>{String(pendingQueue[0]?.channel || 'whatsapp').toUpperCase()}</strong> &mdash;
                Confirm outcome to prevent outgoing contact lock on other leads.
              </div>
            </div>
            <button
              className="btn btn-navy btn-sm"
              onClick={() => {
                setResolvingItem(pendingQueue[0]);
                setResolveStatus(
                  String(pendingQueue[0]?.channel || '').toLowerCase() === 'call'
                    ? 'connected'
                    : 'sent'
                );
              }}
            >
              ✓ Confirm &amp; Resolve Now
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. COUNSELLOR DASHBOARD */}
      {/* ========================================================================= */}
      {role === 'counsellor' && (
        <div>
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, #123B70 0%, #1D4ED8 100%)',
              color: 'white',
              padding: '16px 20px',
              borderRadius: '16px',
              marginBottom: '20px',
              boxShadow: '0 10px 25px -5px rgba(18, 59, 112, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '20px' }}>👩‍💼</span>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                    {user?.fullName || 'Counsellor Workspace'} ({user?.employeeId || 'COUNSELLOR'})
                  </h2>
                  <span
                    style={{
                      background: '#16A34A',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 10px',
                      borderRadius: '999px',
                    }}
                  >
                    🟢 ACTIVE SESSION
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', opacity: 0.9 }}>
                  Assigned Portfolio: <strong>{jrData?.totalLeads ?? leads.length}</strong> Leads &bull;
                  Today Follow-ups: <strong>{jrData?.todayFollowUps ?? 0}</strong> &bull;
                  Overdue: <strong>{jrData?.overdueFollowUps ?? 0}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm btn-white"
                  style={{ background: '#FFFFFF', color: '#123B70', fontWeight: 700 }}
                  onClick={onOpenNewLead}
                >
                  ➕ New Lead
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: '#16A34A', color: 'white', border: 'none', fontWeight: 700 }}
                  onClick={() => onNavigateTab('followups')}
                >
                  📅 Today Follow-ups
                </button>
                <button
                  className="btn btn-sm"
                  style={{
                    background: 'rgba(255,255,255,0.18)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.3)',
                    fontWeight: 700,
                  }}
                  onClick={() => setShowReportModal(true)}
                >
                  📄 My Performance
                </button>
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card blue">
              <div className="stat-card-top">
                <span className="stat-label">My Assigned Leads</span>
                <div className="stat-icon">📥</div>
              </div>
              <div className="stat-value">{jrData?.totalLeads ?? leads.length}</div>
              <div className="stat-trend">Live Portfolio Count</div>
            </div>

            <div className="stat-card purple">
              <div className="stat-card-top">
                <span className="stat-label">Calls &amp; WhatsApp Logged</span>
                <div className="stat-icon">📞</div>
              </div>
              <div className="stat-value">
                {(jrData?.callsMadeCount ?? 0) + (jrData?.waSentCount ?? 0)}
              </div>
              <div className="stat-trend up">
                {jrData?.callsMadeCount ?? 0} Calls &bull; {jrData?.waSentCount ?? 0} WA
              </div>
            </div>

            <div className="stat-card amber">
              <div className="stat-card-top">
                <span className="stat-label">Follow-ups Due / Overdue</span>
                <div className="stat-icon">⏰</div>
              </div>
              <div className="stat-value">
                {(jrData?.todayFollowUps ?? 0) + (jrData?.overdueFollowUps ?? 0)}
              </div>
              <div className="stat-trend">
                {jrData?.todayFollowUps ?? 0} Today &bull; {jrData?.overdueFollowUps ?? 0} Overdue
              </div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">My Earned Commission</span>
                <div className="stat-icon">💰</div>
              </div>
              <div className="stat-value">
                ₹{Number(jrData?.earnedCommission ?? paidCommAmount).toLocaleString('en-IN')}
              </div>
              <div className="stat-trend up">Sub-Stage C Confirmed Payouts</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">📞 Active Calling &amp; WhatsApp Queue</h3>
                <span className="card-subtitle">
                  Live PostgreSQL student leads with direct Dial &amp; WhatsApp logging
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => onNavigateTab('leads')}>
                Open Full Lead Table →
              </button>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lead ID</th>
                    <th>Student &amp; Class</th>
                    <th>Parent Contact</th>
                    <th>Stage</th>
                    <th>Lead Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLeadsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                        {loadingDash ? 'Loading live portfolio...' : 'No leads assigned yet.'}
                      </td>
                    </tr>
                  ) : (
                    recentLeadsList.map((l: any) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.leadNumber || l.id?.slice(0, 8)}</strong>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{l.studentName}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {l.admissionClass || l.applyingForGrade || 'Class 6'}
                          </div>
                        </td>
                        <td>
                          <div>{l.fatherName || l.parentName || 'Parent'}</div>
                          <div style={{ fontSize: '11px', color: '#475569' }}>
                            {l.fatherPhone || l.mobile || 'N/A'}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-info">{l.stage || l.status || 'new'}</span>
                        </td>
                        <td>
                          <span className="badge badge-success">{l.leadScore ?? l.score ?? 0} pts</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleOpenCallLogger(l)}
                            >
                              📞 Call &amp; Log
                            </button>
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => handleOpenWhatsAppQuick(l)}
                            >
                              💬 WhatsApp
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SENIOR MANAGER DASHBOARD */}
      {/* ========================================================================= */}
      {role === 'manager' && (
        <div>
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, #0A254A 0%, #16A34A 100%)',
              color: 'white',
              padding: '16px 20px',
              borderRadius: '16px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '22px' }}>👔</span>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                    Senior Manager: {user?.fullName || 'Manager'} ({user?.employeeId || 'SR-MGR'})
                  </h2>
                </div>
                <div style={{ fontSize: '12.5px', opacity: 0.9, marginTop: '4px' }}>
                  Managing <strong>{srData?.teamSize ?? 0} Direct Counsellors</strong> &bull;
                  Pending Queue Alerts: <strong>{srData?.pendingQueueAlerts?.length ?? pendingQueue.length}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm btn-white"
                  style={{ background: '#FFFFFF', color: '#0A254A', fontWeight: 700 }}
                  onClick={() => onNavigateTab('leads')}
                >
                  📋 Review Leads
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }}
                  onClick={() => onNavigateTab('admissions')}
                >
                  🎓 Applications
                </button>
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card blue">
              <div className="stat-card-top">
                <span className="stat-label">Total Team Leads</span>
                <div className="stat-icon">📥</div>
              </div>
              <div className="stat-value">{srData?.totalLeads ?? leads.length}</div>
              <div className="stat-trend">Across {srData?.teamSize ?? 0} Counsellors</div>
            </div>

            <div className="stat-card amber">
              <div className="stat-card-top">
                <span className="stat-label">Pending Verification Queue</span>
                <div className="stat-icon">⏳</div>
              </div>
              <div className="stat-value">{pendingVerifyCount}</div>
              <div className="stat-trend">Needs Manager Quality Check</div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Approved / Qualified Leads</span>
                <div className="stat-icon">✅</div>
              </div>
              <div className="stat-value">{approvedLeadsCount}</div>
              <div className="stat-trend">Active Admission Pipeline</div>
            </div>

            <div className="stat-card purple">
              <div className="stat-card-top">
                <span className="stat-label">Applications / Campus Visits</span>
                <div className="stat-icon">🏫</div>
              </div>
              <div className="stat-value">{srData?.applicationsCount ?? campusVisitsCount}</div>
              <div className="stat-trend">
                Expired: {srData?.expiredCount ?? 0} &bull; Merged: {srData?.duplicateLeadsCount ?? 0}
              </div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Team Commission Ledger</span>
                <div className="stat-icon">💰</div>
              </div>
              <div className="stat-value">₹{totalCommAmount.toLocaleString('en-IN')}</div>
              <div className="stat-trend">
                Paid / Realized: ₹{paidCommAmount.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">🏫 Team Pipeline &amp; Follow-up Coordinator</h3>
                <span className="card-subtitle">
                  Live leads across your counsellors with direct Brochure &amp; Follow-up scheduling
                </span>
              </div>
              <span className="badge badge-navy">{leads.length} Total</span>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Parent Mobile</th>
                    <th>Assigned Counsellor</th>
                    <th>Stage</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 8).map((l: any) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.studentName}</strong> ({l.admissionClass || 'Class 6'})
                      </td>
                      <td>{l.fatherPhone || l.mobile || 'N/A'}</td>
                      <td>{l.assignedTo?.fullName || 'Team Pool'}</td>
                      <td>
                        <span className="badge badge-info">{l.stage || l.status}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleOpenWhatsAppQuick(l)}
                          >
                            📱 Send Brochure
                          </button>
                          <button
                            className="btn btn-sm btn-warning"
                            onClick={() => setShowFollowUpModal(l)}
                          >
                            📅 Reschedule
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {leads.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                        No team leads recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUPER ADMIN DASHBOARD (LIVE CONTROL & MONITORING) */}
      {/* ========================================================================= */}
      {role === 'admin' && (
        <div>
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
              color: 'white',
              padding: '16px 20px',
              borderRadius: '16px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  👑 Super Admin Master Operations Control
                </h2>
                <div style={{ fontSize: '12.5px', opacity: 0.9, marginTop: '4px' }}>
                  Managing <strong>{adminData?.managersCount ?? 0} Managers</strong>,{' '}
                  <strong>{adminData?.counsellorsCount ?? 0} Counsellors</strong>,{' '}
                  <strong>{adminData?.totalSchools ?? schools.length} Schools</strong> &amp;{' '}
                  <strong>{adminData?.activeSessions ?? 0} Active Sessions</strong>.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm btn-white"
                  style={{ background: '#FFFFFF', color: '#0F172A', fontWeight: 700 }}
                  onClick={() => onNavigateTab('users')}
                >
                  👤 Create Manager / Counsellor Account
                </button>
                <button
                  className="btn btn-sm btn-success"
                  onClick={() => onNavigateTab('commissions')}
                >
                  🏦 Global Commission Payout Ledger
                </button>
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card blue">
              <div className="stat-card-top">
                <span className="stat-label">Total School Enquiries</span>
                <div className="stat-icon">📥</div>
              </div>
              <div className="stat-value">
                {adminData?.totalLeads ?? kpiStats.totalLeads ?? leads.length}
              </div>
              <div className="stat-trend up">
                <span>↑</span> Live PostgreSQL Lead Count
              </div>
            </div>

            <div className="stat-card purple">
              <div className="stat-card-top">
                <span className="stat-label">Active Managers &amp; Teams</span>
                <div className="stat-icon">👔</div>
              </div>
              <div className="stat-value">
                {adminData?.managersCount ?? teams.length}
              </div>
              <div className="stat-trend">
                {teams.length} Teams &bull; {adminData?.counsellorsCount ?? 0} Counsellors
              </div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Total Confirmed Admissions</span>
                <div className="stat-icon">🎓</div>
              </div>
              <div className="stat-value">
                {adminData?.totalAdmissions ?? kpiStats.confirmedAdmissions ?? 0}
              </div>
              <div className="stat-trend up">
                <span>↑</span> Uttarakhand Boarding Placements
              </div>
            </div>

            <div className="stat-card amber">
              <div className="stat-card-top">
                <span className="stat-label">Pending Verification Queue</span>
                <div className="stat-icon">⏳</div>
              </div>
              <div className="stat-value">
                {adminData?.pendingVerifications ?? pendingVerifyCount}
              </div>
              <div className="stat-trend">Needs Manager Review</div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Total Organization Commission</span>
                <div className="stat-icon">💰</div>
              </div>
              <div className="stat-value">
                ₹{Number(adminData?.totalCommission ?? totalCommAmount).toLocaleString('en-IN')}
              </div>
              <div className="stat-trend">
                Realized: ₹{Number(adminData?.realizedCommission ?? paidCommAmount).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  🟢 Live Employee Presence &amp; Shift Monitor (Admin View)
                </h3>
                <span className="card-subtitle">
                  Real-time employee login timestamps, teams, and account statuses from PostgreSQL.
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={fetchDashboardData}>
                🔄 {loadingDash ? 'Refreshing...' : 'Refresh Live Status'}
              </button>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Role</th>
                    <th>Assigned Team / Manager</th>
                    <th>Last Login Time</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(adminData?.presenceMonitor || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: '#64748B' }}>
                        {loadingDash ? 'Loading employee presence...' : 'No active employees found.'}
                      </td>
                    </tr>
                  ) : (
                    (adminData?.presenceMonitor || []).map((emp: any) => (
                      <tr key={emp.id}>
                        <td>
                          <strong>{emp.fullName}</strong>{' '}
                          <span style={{ fontSize: '11px', color: '#64748B' }}>
                            ({emp.employeeCode || emp.email})
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-info">{emp.role}</span>
                        </td>
                        <td>{emp.team?.name || emp.manager?.fullName || 'Organization Core'}</td>
                        <td>
                          {emp.lastLoginAt
                            ? new Date(emp.lastLoginAt).toLocaleString()
                            : 'Never logged in'}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              emp.status === 'active' || emp.status === 'ACTIVE'
                                ? 'badge-success'
                                : 'badge-warning'
                            }`}
                          >
                            {emp.status || 'active'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => {
                              setShowReassignModal(emp);
                              setTargetTeamId(teams[0]?.id || '');
                            }}
                          >
                            🔄 Reassign Team
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Phone Call Logger */}
      {selectedLeadForCall && (
        <div className="modal-overlay" onClick={() => setSelectedLeadForCall(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                  📞 Call Parent &amp; Record Outcome
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Student: <strong>{selectedLeadForCall.studentName}</strong> (
                  {selectedLeadForCall.admissionClass || 'Class 6'})
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setSelectedLeadForCall(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveCallFeedback}>
              <div className="modal-body">
                <div
                  style={{
                    background: '#F8FAFC',
                    padding: '12px',
                    borderRadius: '10px',
                    marginBottom: '14px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <label className="form-label">Select Contact</label>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="callWhom"
                        checked={callWhom === 'father'}
                        onChange={() => setCallWhom('father')}
                      />
                      <span>
                        👨 Father:{' '}
                        <strong>
                          {selectedLeadForCall.fatherPhone || selectedLeadForCall.mobile || 'N/A'}
                        </strong>
                      </span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="callWhom"
                        checked={callWhom === 'mother'}
                        onChange={() => setCallWhom('mother')}
                      />
                      <span>
                        👩 Mother:{' '}
                        <strong>{selectedLeadForCall.motherPhone || 'Not Provided'}</strong>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Call Connection Outcome</label>
                  <select
                    className="form-control"
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                  >
                    {callOutcomes.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Lead Quality Classification</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${callIntent === 'GENUINE' ? 'btn-success' : 'btn-outline'}`}
                      style={{ flex: 1 }}
                      onClick={() => setCallIntent('GENUINE')}
                    >
                      🌟 Genuine Boarding Lead
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${callIntent === 'JUNK' ? 'btn-danger' : 'btn-outline'}`}
                      style={{ flex: 1 }}
                      onClick={() => setCallIntent('JUNK')}
                    >
                      ❌ Not Interested / Junk
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Interaction Notes (Mandatory)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    required
                    placeholder="Record budget, school preferences, and agreed next steps..."
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setSelectedLeadForCall(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Save Call Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Quick WhatsApp Brochure Sender */}
      {showBrochureModal && (
        <div className="modal-overlay" onClick={() => setShowBrochureModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                💬 Send WhatsApp &amp; Prospectus
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowBrochureModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">
                  Message ({brochureText.length}/2000 characters)
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  maxLength={2000}
                  value={brochureText}
                  onChange={(e) => setBrochureText(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowBrochureModal(null)}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handleSendWhatsAppQuick}>
                📱 Generate wa.me Link &amp; Track
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Counsellor Performance Summary */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                📄 Live Performance Summary
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowReportModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${reportPeriod === 'weekly' ? 'btn-navy' : 'btn-outline'}`}
                  onClick={() => setReportPeriod('weekly')}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${reportPeriod === 'monthly' ? 'btn-navy' : 'btn-outline'}`}
                  onClick={() => setReportPeriod('monthly')}
                >
                  Monthly
                </button>
              </div>
              <div
                style={{
                  background: '#F8FAFC',
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>User:</span>
                  <strong>{user?.fullName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Assigned Leads:</span>
                  <strong>{jrData?.totalLeads ?? leads.length}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Calls Made / WhatsApp Sent:</span>
                  <strong>
                    {jrData?.callsMadeCount ?? 0} Calls / {jrData?.waSentCount ?? 0} WA
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #CBD5E1', paddingTop: '8px' }}>
                  <span>Confirmed Commission Earned:</span>
                  <strong style={{ color: '#16A34A' }}>
                    ₹{Number(jrData?.earnedCommission ?? paidCommAmount).toLocaleString('en-IN')}
                  </strong>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowReportModal(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowReportModal(false);
                  onNavigateTab('reports');
                }}
              >
                Open Full 20-Report Suite →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Follow-Up Date Update with Mandatory Reason */}
      {showFollowUpModal && (
        <div className="modal-overlay" onClick={() => setShowFollowUpModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                📅 Reschedule Follow-up ({showFollowUpModal.studentName})
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowFollowUpModal(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleRescheduleFollowUp}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Follow-up Date</label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={newFollowUpDate}
                    onChange={(e) => setNewFollowUpDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reason (Min 5 chars, logged to Audit)</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="Parent travelling until Thursday..."
                    value={followUpReason}
                    onChange={(e) => setFollowUpReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowFollowUpModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-warning">
                  Save Reschedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Team Reassignment */}
      {showReassignModal && (
        <div className="modal-overlay" onClick={() => setShowReassignModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                🔄 Reassign Team
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowReassignModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px' }}>
                Assign <strong>{showReassignModal.fullName}</strong> to a Manager team:
              </p>
              <div className="form-group">
                <label className="form-label">Target Team</label>
                <select
                  className="form-control"
                  value={targetTeamId}
                  onChange={(e) => setTargetTeamId(e.target.value)}
                >
                  <option value="">-- Select Team --</option>
                  {teams.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowReassignModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!targetTeamId}
                onClick={handleReassignUserTeam}
              >
                Confirm Reassignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 6: Resolve Layer-3 Pending Logging Queue Item */}
      {resolvingItem && (
        <div className="modal-overlay" onClick={() => setResolvingItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                ✓ Resolve Pending {String(resolvingItem.channel || 'whatsapp').toUpperCase()} Outcome
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setResolvingItem(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleResolveQueueItem}>
              <div className="modal-body">
                <div
                  style={{
                    background: '#F8FAFC',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    fontSize: '12px',
                  }}
                >
                  <strong>Student:</strong> {resolvingItem.lead?.studentName || 'Student'} &bull;{' '}
                  <strong>Phone:</strong> {resolvingItem.targetPhone || 'N/A'}
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery / Contact Status</label>
                  <select
                    className="form-control"
                    value={resolveStatus}
                    onChange={(e) => setResolveStatus(e.target.value)}
                  >
                    <option value="sent">Sent / Delivered Successfully</option>
                    <option value="connected">Connected &amp; Spoke</option>
                    <option value="no_answer">No Answer / Pending</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Outcome Summary</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={resolveOutcome}
                    onChange={(e) => setResolveOutcome(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Additional Notes</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={resolveNotes}
                    onChange={(e) => setResolveNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setResolvingItem(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm &amp; Clear Lock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
