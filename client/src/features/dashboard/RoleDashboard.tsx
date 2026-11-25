import React, { useEffect, useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { useAuthStore } from '../../stores/authStore';
import { apiCall } from '../../lib/api';
import { normalizeRoleKey } from '../../lib/roles';
import LeadReportModal from '../leads/LeadReportModal';

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
  const { user, previewRole, setPreviewRole } = useAuthStore();
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
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
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
  const [callDirection, setCallDirection] = useState<'Outbound' | 'Inbound'>('Outbound');
  const [callDuration, setCallDuration] = useState('');
  const [callRecordingLink, setCallRecordingLink] = useState('');
  const [callDpdpConsent, setCallDpdpConsent] = useState(true);
  const [callRequirements, setCallRequirements] = useState('');
  const [callPreferredLocation, setCallPreferredLocation] = useState('Dehradun');
  const [callBudget, setCallBudget] = useState('400000');

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
  const [selectedStaffModal, setSelectedStaffModal] = useState<any | null>(null);
  const [targetTeamId, setTargetTeamId] = useState('');
  const [manualTeamName, setManualTeamName] = useState('');
  const [topTeamMetric, setTopTeamMetric] = useState<'leads' | 'admissions' | 'commission'>('leads');
  const [perfRange, setPerfRange] = useState('Last 30 Days');
  const [mgrActivityTab, setMgrActivityTab] = useState<'online' | 'working' | 'inactive'>('online');
  const [mgrSelectedTeam, setMgrSelectedTeam] = useState('North Team');
  const [counsellorPage, setCounsellorPage] = useState(1);
  const [selectedReportLead, setSelectedReportLead] = useState<any | null>(null);

  const showToast = (text: string, type: 'success' | 'warning' | 'danger' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchDashboardData = async () => {
    setLoadingDash(true);
    try {
      const [queueRes, outcomesRes, usersRes] = await Promise.all([
        apiCall('/pending-logging-queue').catch(() => ({ items: [] })),
        apiCall('/calls/outcomes').catch(() => ({ outcomes: [] })),
        apiCall('/users').catch(() => ({ users: [] })),
      ]);
      const qList = queueRes?.items || queueRes?.queue || queueRes?.data?.items || [];
      setPendingQueue(Array.isArray(qList) ? qList : []);
      const uList = usersRes?.users || usersRes?.data?.users || usersRes?.data || [];
      setAllEmployees(Array.isArray(uList) ? uList : []);
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
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);
    return () => clearInterval(interval);
  }, [role]);

  // Real presence (heartbeat-based). Admin sees everyone, Manager sees own team.
  const [presenceRows, setPresenceRows] = useState<any[]>([]);
  const [presenceSummary, setPresenceSummary] = useState<any>(null);
  useEffect(() => {
    if (role === 'counsellor') return;
    let cancelled = false;
    const load = async () => {
      const res = await apiCall('/presence/team?limit=200').catch(() => null);
      if (cancelled || !res) return;
      setPresenceRows(Array.isArray(res.rows) ? res.rows : []);
      setPresenceSummary(res.summary || null);
    };
    load();
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [role]);

  // Derived aggregates from live collections + role API
  const pendingVerifyCount = leads.filter((l) =>
    ['pending', 'pending_verification'].includes(
      String(l.verificationStatus || l.status || '').toLowerCase()
    )
  ).length;
  const returnedLeadsCount = leads.filter(
    (l) => String(l.verificationStatus || '').toUpperCase() === 'RETURNED'
  ).length;
  const fakeOrDisqualifiedCount = leads.filter(
    (l) =>
      ['disqualified', 'junk', 'lost'].includes(String(l.status || '').toLowerCase()) ||
      String(l.verificationStatus || '').toUpperCase() === 'RETURNED'
  ).length;
  const approvedLeadsCount = leads.filter(
    (l) =>
      ['verified', 'qualified', 'shortlisted', 'enrolled', 'admission_done'].includes(
        String(l.status || '').toLowerCase()
      ) || String(l.verificationStatus || '').toUpperCase() === 'APPROVED'
  ).length;
  const submittedLeadsCount = leads.filter(
    (l) =>
      Boolean(l.submittedToManagerAt) ||
      ['PENDING_VERIFICATION', 'APPROVED', 'RETURNED'].includes(
        String(l.verificationStatus || '').toUpperCase()
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
    setCallIntent(lead.isGenuine !== false ? 'GENUINE' : 'JUNK');
    setCallNotes('');
    setCallDirection('Outbound');
    setCallDuration('');
    setCallRecordingLink('');
    setCallDpdpConsent(true);
    setCallRequirements(lead.parentRequirements || lead.requirements || '');
    const loc = Array.isArray(lead.preferredLocations)
      ? lead.preferredLocations.join(', ')
      : lead.preferredLocation || 'Dehradun';
    setCallPreferredLocation(loc);
    setCallBudget(String(lead.budgetMax || lead.annualBudget || '400000'));
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

      let durSec = 260;
      if (callDuration.includes(':')) {
        const parts = callDuration.split(':');
        durSec = parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
      } else if (!isNaN(Number(callDuration))) {
        durSec = Number(callDuration);
      }

      await apiCall('/calls/log', 'POST', {
        lead_id: selectedLeadForCall.id,
        leadId: selectedLeadForCall.id,
        parentWhom: callWhom,
        phone: targetPhone,
        outcome: callOutcome,
        direction: callDirection,
        duration_seconds: durSec,
        recording_link: callRecordingLink,
        dpdp_consent: callDpdpConsent,
        recordingConsent: callDpdpConsent,
        recording_consent: callDpdpConsent,
        is_genuine: callIntent === 'GENUINE',
        parent_requirements: callRequirements,
        preferred_location: callPreferredLocation,
        budget_max: callBudget ? Number(callBudget) : undefined,
        notes: `${callIntent === 'GENUINE' ? '[GENUINE] ' : '[JUNK] '}${callNotes}`,
      });
      showToast(
        `Call outcome & feedback saved! Manager notified for ${selectedLeadForCall.studentName}.`,
        'success'
      );
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
    if (!showReassignModal || (!targetTeamId && !manualTeamName.trim())) return;
    try {
      await apiCall(`/users/${showReassignModal.id}/role`, 'PATCH', {
        teamId: manualTeamName.trim() ? undefined : targetTeamId,
        customTeamName: manualTeamName.trim() || undefined,
        reason: 'Dashboard shift monitor reassignment',
      });
      showToast(
        `${showReassignModal.fullName || 'Employee'} assigned to team ${manualTeamName.trim() || 'selected team'} cleanly!`,
        'success'
      );
      setShowReassignModal(null);
      setManualTeamName('');
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
          <span>{toastMsg.type === 'success' ? '' : toastMsg.type === 'danger' ? <CrmIcon name="x-circle" size={15} /> : <CrmIcon name="alert" size={15} />}</span>{' '}
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
                <CrmIcon name="clock" size={16} /> Layer-3 Activity Confirmation Required ({pendingQueue.length} Pending)
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
              <CrmIcon name="check" size={16} /> Confirm &amp; Resolve Now
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. COUNSELLOR DASHBOARD (EXACT REFERENCE DESIGN & LIVE WORKING SYSTEM) */}
      {/* ========================================================================= */}
      {role === 'counsellor' && (
        <div className="dash-role-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* 1. Premium Deep Navy-Blue Hero Banner matching Manager Hero Style */}
          <div
            className="dash-hero-banner"
            style={{
              background:
                'linear-gradient(95deg, #09204C 0%, #143D85 52%, #1D4ED8 100%)',
              color: '#FFFFFF',
              borderRadius: '18px',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.28)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.14)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="sparkles" size={20} color="#FDE047" />
              </div>
              <div>
                <h2
                  className="dash-hero-title"
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    margin: 0,
                    letterSpacing: '-0.3px',
                  }}
                >
                  Hello!
                </h2>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.88)', marginTop: '3px' }}>
                  Here&apos;s your performance and latest updates.
                </div>
              </div>
            </div>

            <div className="dash-hero-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div
                style={{
                  background: '#FFFFFF',
                  color: '#0F172A',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.12)',
                }}
              >
                <CrmIcon name="users" size={15} color="#1D4ED8" />
                <span>Team: {teams[0]?.name || 'Unassigned'}</span>
              </div>

              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.2)',
                  border: '1px solid rgba(134, 239, 172, 0.45)',
                  color: '#DCFCE7',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#4ADE80',
                    boxShadow: '0 0 6px #4ADE80',
                  }}
                />
                Online
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.14)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CrmIcon name="calendar" size={14} color="#BFDBFE" />
                <span>
                  {new Date().toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    weekday: 'short',
                  })}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('leads')}
                style={{
                  background: '#0F295A',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255,255,255,0.28)',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                View My Leads →
              </button>
            </div>
          </div>

          {/* 2. Four Clean KPI Cards Row */}
          <div className="dash-kpi-grid-4">
            {/* Card 1: Total Leads */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('leads')}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#EBF3FE',
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="users" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {jrData?.totalLeads ?? leads.length}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Total Assigned Leads
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  +{jrData?.todayNewLeads ?? 0} new today
                </div>
              </div>
            </div>

            {/* Card 2: Confirmed Leads */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('leads')}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#DCFCE7',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="check" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {approvedLeadsCount}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Confirmed Leads
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  {leads.length > 0 ? `${Math.round((approvedLeadsCount / leads.length) * 100)}% verified rate` : '0% verified rate'}
                </div>
              </div>
            </div>

            {/* Card 3: Commission Earned */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('commissions')}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#F3EEFF',
                  color: '#7C3AED',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                ₹
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  ₹{Number(jrData?.earnedCommission ?? paidCommAmount ?? 0).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Commission Earned
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  Live ledger balance
                </div>
              </div>
            </div>

            {/* Card 4: Follow-ups Today */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('followups')}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#FFF4E5',
                  color: '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="calendar" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {(jrData?.todayFollowUps ?? 0) + (jrData?.overdueFollowUps ?? 0)}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Follow-ups Today
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  {returnedLeadsCount > 0
                    ? `${returnedLeadsCount} Returned for Correction`
                    : `${jrData?.overdueFollowUps ?? 0} overdue`}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Middle Row: Latest Leads Table + Today's Activity Timeline */}
          <div className="dash-mid-grid-counsellor">
            {/* Left Card: Latest Leads Table */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px', color: '#2563EB' }}><CrmIcon name="megaphone" size={16} /></span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Latest Leads
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => onNavigateTab('leads')}
                  style={{ color: '#2563EB', borderColor: '#BFDBFE', fontWeight: 700 }}
                >
                  View All Leads →
                </button>
              </div>

              {(() => {
                const rowsToRender =
                  leads.length > 0
                    ? leads.slice((counsellorPage - 1) * 5, counsellorPage * 5).map((l: any) => {
                        const rawSt = String(l.status || 'new').toLowerCase();
                        const isVerifReturned =
                          String(l.verificationStatus || '').toUpperCase() === 'RETURNED';
                        const statusLabel = isVerifReturned
                          ? 'Correction Req'
                          : rawSt === 'qualified' || rawSt === 'enrolled' || rawSt === 'admission_done'
                          ? 'Confirmed'
                          : rawSt === 'contacted' || rawSt === 'applied' || rawSt === 'selected'
                          ? 'In Progress'
                          : rawSt === 'shortlisted'
                          ? 'Pending'
                          : 'New';
                        const statusBg = isVerifReturned
                          ? '#FEE2E2'
                          : statusLabel === 'Confirmed'
                          ? '#DCFCE7'
                          : statusLabel === 'In Progress'
                          ? '#FEF3C7'
                          : statusLabel === 'Pending'
                          ? '#DBEAFE'
                          : '#FEE2E2';
                        const statusColor = isVerifReturned
                          ? '#DC2626'
                          : statusLabel === 'Confirmed'
                          ? '#15803D'
                          : statusLabel === 'In Progress'
                          ? '#B45309'
                          : statusLabel === 'Pending'
                          ? '#1D4ED8'
                          : '#DC2626';

                        return {
                          ...l,
                          studentName: l.studentName,
                          admissionClass: l.applyingForGrade || l.admissionClass || '—',
                          fatherName: l.parentName || l.fatherName || 'Parent',
                          fatherPhone: l.parentPhone || l.fatherPhone || l.mobile || '—',
                          leadSource: l.leadSource || l.source || 'Direct',
                          statusLabel,
                          statusBg,
                          statusColor,
                        };
                      })
                    : [];

                return (
                  <>
                    <div className="table-container" style={{ border: 'none' }}>
                      <table className="data-table" style={{ minWidth: '580px' }}>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Student Name</th>
                            <th>Class</th>
                            <th>Parent Name</th>
                            <th>Contact</th>
                            <th>Source</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowsToRender.length === 0 ? (
                            <tr>
                              <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748B', fontSize: '12.5px' }}>
                                No leads assigned yet. Click <strong>+ New Lead</strong> to add your first student inquiry.
                              </td>
                            </tr>
                          ) : (
                          rowsToRender.map((r: any, idx: number) => (
                            <tr key={r.id || idx}>
                              <td>{(counsellorPage - 1) * 5 + idx + 1}</td>
                              <td>
                                <strong style={{ color: '#0F172A' }}>{r.studentName}</strong>
                              </td>
                              <td>{r.admissionClass}</td>
                              <td>{r.fatherName}</td>
                              <td style={{ fontWeight: 600, color: '#1E293B' }}>{r.fatherPhone}</td>
                              <td>{r.leadSource}</td>
                              <td>
                                <span
                                  style={{
                                    background: r.statusBg,
                                    color: r.statusColor,
                                    padding: '3px 10px',
                                    borderRadius: '999px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                  }}
                                >
                                  {r.statusLabel}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline"
                                  style={{
                                    color: '#2563EB',
                                    borderColor: '#93C5FD',
                                    fontWeight: 700,
                                    padding: '3px 10px',
                                  }}
                                  onClick={() => setSelectedReportLead(r)}
                                >
                                  Check
                                </button>
                              </td>
                            </tr>
                          )))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px solid #F1F5F9',
                        fontSize: '12px',
                        color: '#64748B',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <span>
                        Showing {rowsToRender.length > 0 ? (counsellorPage - 1) * 5 + 1 : 0} to {(counsellorPage - 1) * 5 + rowsToRender.length} of {leads.length} leads
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 2, 3].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setCounsellorPage(p)}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              border: counsellorPage === p ? 'none' : '1px solid #E2E8F0',
                              background: counsellorPage === p ? '#2563EB' : '#FFFFFF',
                              color: counsellorPage === p ? '#FFFFFF' : '#334155',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right Card: Today's Activity Live Timeline */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px', color: '#7C3AED' }}><CrmIcon name="trending-up" size={16} /></span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Today&apos;s Activity
                  </h3>
                </div>
                <span
                  style={{
                    background: '#DCFCE7',
                    color: '#15803D',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  ● Live
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  position: 'relative',
                  paddingLeft: '18px',
                  borderLeft: '2px solid #E2E8F0',
                  marginLeft: '8px',
                }}
              >
                {(leads.length > 0
                  ? leads.slice(0, 4).map((l: any, idx: number) => ({
                      dot: ['#22C55E', '#2563EB', '#8B5CF6', '#10B981'][idx % 4],
                      time: l.updatedAt || l.createdAt
                        ? new Date(l.updatedAt || l.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                        : 'Today',
                      title: String(l.status || 'new').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                      sub: `${l.studentName} (${l.leadSource || 'Direct'})`,
                    }))
                  : [{ dot: '#94A3B8', time: '—', title: 'No activity yet', sub: 'New leads & call logs will appear here live.' }]
                ).map((act, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '-24px',
                        top: '4px',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: act.dot,
                        border: '2px solid #FFFFFF',
                        boxShadow: '0 0 0 2px #E2E8F0',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: '#64748B',
                          minWidth: '58px',
                        }}
                      >
                        {act.time}
                      </span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                          {act.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                          {act.sub}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Bottom Row: 3-Column Split (My Performance + Visit Schedule + Quick Actions) */}
          <div className="dash-bottom-grid-3">
            {/* Column 1: My Performance */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '16px' }}><CrmIcon name="trophy" size={16} /></span>
                  <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    My Performance
                  </h3>
                </div>
                <select className="dashboard-select" defaultValue="This Week">
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                </select>
              </div>

              {/* 4 Mini Stat Boxes */}
              <div className="dash-mini-stats-4">
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '8px 6px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                    <CrmIcon name="phone" size={16} /> {jrData?.callsMadeCount ?? 0}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                    Calls ({jrData?.todayCalls ?? 0} today)
                  </div>
                </div>

                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '8px 6px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#16A34A' }}>
                    <CrmIcon name="check" size={16} /> {jrData?.admissionConfirmed ?? 0}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                    Confirmed Adm.
                  </div>
                </div>

                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '8px 6px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#7C3AED' }}>
                    ₹{Number(jrData?.earnedCommission ?? 0).toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                    Earned Comm.
                  </div>
                </div>

                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '8px 6px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#047857' }}>
                    {jrData?.weeklyCompliancePct ?? 100}%
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                    3-Layer Compliance
                  </div>
                </div>
              </div>

              {/* Extended Live Counsellor KPIs & Operations Widgets (100% PostgreSQL) */}
              <div
                style={{
                  marginTop: '14px',
                  paddingTop: '12px',
                  borderTop: '1px solid #E2E8F0',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: '8px',
                }}
              >
                {[
                  { label: 'Upcoming F/U', value: jrData?.upcomingFollowUps ?? 0, color: '#2563EB' },
                  { label: 'Interested', value: jrData?.interestedParents ?? 0, color: '#16A34A' },
                  { label: 'Not Interested', value: jrData?.notInterestedParents ?? 0, color: '#DC2626' },
                  { label: 'In Progress Adm.', value: jrData?.admissionInProgress ?? 0, color: '#7C3AED' },
                  { label: 'WA Sent', value: jrData?.waSentCount ?? 0, color: '#059669' },
                  { label: 'Pending Conf.', value: jrData?.pendingConfirmations?.total_pending ?? 0, color: '#D97706' },
                  { label: 'Pending Comm.', value: `₹${Number(jrData?.pendingCommission ?? 0).toLocaleString('en-IN')}`, color: '#B45309' },
                  { label: 'Paid Comm.', value: `₹${Number(jrData?.paidCommission ?? 0).toLocaleString('en-IN')}`, color: '#15803D' },
                  { label: 'Upcoming Visits', value: (jrData?.upcomingVisits || []).length, color: '#0284C7' },
                  { label: 'Pending Inst.', value: (jrData?.pendingInstallments || []).length, color: '#EA580C' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '9px',
                      padding: '7px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: stat.color }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Weekly Line Chart */}
              <svg viewBox="0 0 340 120" style={{ width: '100%', height: 'auto', display: 'block' }}>
                {[20, 50, 80, 102].map((y, idx) => (
                  <g key={y}>
                    <line x1="25" y1={y} x2="325" y2={y} stroke="#E2E8F0" strokeDasharray="2 2" />
                    <text x="4" y={y + 3} fontSize="9.5" fill="#64748B">
                      {['30', '20', '10', '0'][idx]}
                    </text>
                  </g>
                ))}
                <path
                  d="M35,72 L82,58 L130,60 L178,36 L225,28 L272,34 L318,40 L318,102 L35,102 Z"
                  fill="rgba(37, 99, 235, 0.14)"
                />
                <polyline
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  points="35,72 82,58 130,60 178,36 225,28 272,34 318,40"
                />
                {[
                  [35, 72, 'Mon'],
                  [82, 58, 'Tue'],
                  [130, 60, 'Wed'],
                  [178, 36, 'Thu'],
                  [225, 28, 'Fri'],
                  [272, 34, 'Sat'],
                  [318, 40, 'Sun'],
                ].map(([cx, cy, day]) => (
                  <g key={String(day)}>
                    <circle cx={Number(cx)} cy={Number(cy)} r="3.5" fill="#2563EB" />
                    <text
                      x={Number(cx)}
                      y="115"
                      textAnchor="middle"
                      fontSize="9.5"
                      fill="#64748B"
                      fontWeight="600"
                    >
                      {day}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* Column 2: Visit Schedule */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '16px', color: '#2563EB' }}><CrmIcon name="calendar" size={16} /></span>
                  <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Visit Schedule
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('school-visits')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View Calendar →
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  {
                    day: '16',
                    mon: 'Nov',
                    title: 'School Visit',
                    sub: '(DPS Dehradun)',
                    badge: 'Upcoming',
                    badgeBg: '#DBEAFE',
                    badgeCol: '#1D4ED8',
                    time: '10:00 AM',
                  },
                  {
                    day: '17',
                    mon: 'Nov',
                    title: 'Zoom Meeting',
                    sub: '(Parent: Rohan Mehta)',
                    badge: 'Upcoming',
                    badgeBg: '#DBEAFE',
                    badgeCol: '#1D4ED8',
                    time: '04:00 PM',
                  },
                  {
                    day: '18',
                    mon: 'Nov',
                    title: 'Visit Rescheduled',
                    sub: '(New Date: 20 Nov)',
                    badge: 'Rescheduled',
                    badgeBg: '#EDE9FE',
                    badgeCol: '#6D28D9',
                    time: '11:00 AM',
                  },
                ].map((vs, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '12px',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '42px',
                          borderRadius: '10px',
                          background: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1.1,
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                          {vs.day}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                          {vs.mon}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                          {vs.title}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>{vs.sub}</div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          background: vs.badgeBg,
                          color: vs.badgeCol,
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          display: 'inline-block',
                          marginBottom: '4px',
                        }}
                      >
                        {vs.badge}
                      </span>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                        {vs.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 3: Quick Actions (4 Full-Width Colorful Buttons) */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '14px' }}>
                <span style={{ fontSize: '16px', color: '#2563EB' }}><CrmIcon name="zap" size={16} /></span>
                <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Quick Actions
                </h3>
              </div>

              <div className="dash-counsellor-actions-4">
                <button
                  type="button"
                  onClick={() => {
                    if (leads[0]) handleOpenCallLogger(leads[0]);
                    else onNavigateTab('leads');
                  }}
                  style={{
                    width: '100%',
                    background: '#1D63DC',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '11px 16px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span><CrmIcon name="phone" size={16} /></span>
                  <span>Call Parent</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (leads[0]) handleOpenWhatsAppQuick(leads[0]);
                    else onNavigateTab('whatsapp');
                  }}
                  style={{
                    width: '100%',
                    background: '#22C55E',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '11px 16px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span><CrmIcon name="message-square" size={16} /></span>
                  <span>WhatsApp Parent</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenNewLead}
                  style={{
                    width: '100%',
                    background: '#6D28D9',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '11px 16px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span><CrmIcon name="plus" size={16} /></span>
                  <span>Add New Lead</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('ai')}
                  style={{
                    width: '100%',
                    background: '#F97316',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '11px 16px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span><CrmIcon name="school" size={16} /></span>
                  <span>Suggest School</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SENIOR MANAGER DASHBOARD (EXACT REFERENCE DESIGN & LIVE WORKING SYSTEM) */}
      {/* ========================================================================= */}
      {role === 'manager' && (
        <div className="dash-role-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* 1. Deep Navy-Blue Hero Banner with Team Selector & View Team Details */}
          <div
            className="dash-hero-banner"
            style={{
              background:
                'linear-gradient(95deg, #09204C 0%, #143D85 52%, #1D4ED8 100%)',
              color: '#FFFFFF',
              borderRadius: '18px',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '30px' }}><CrmIcon name="sparkles" size={16} /></span>
              <div>
                <h2
                  className="dash-hero-title"
                  style={{
                    fontSize: '21px',
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '-0.3px',
                  }}
                >
                  Welcome back, {user?.fullName || 'Manager'}!
                </h2>
                <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '3px' }}>
                  Here&apos;s your team performance and latest updates.
                </div>
              </div>
            </div>

            <div className="dash-hero-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select
                value={mgrSelectedTeam}
                onChange={(e) => setMgrSelectedTeam(e.target.value)}
                style={{
                  background: '#FFFFFF',
                  color: '#0F172A',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="North Team">Team: North Team</option>
                {teams.map((t: any) => (
                  <option key={t.id} value={t.name}>Team: {t.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => onNavigateTab('counsellors')}
                style={{
                  background: '#0F295A',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255,255,255,0.28)',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                View Team Details →
              </button>
            </div>
          </div>

          {/* Manager 8 Main Tabs Quick-Access Bar (Phase 2 Specification) */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              padding: '4px 0',
              scrollbarWidth: 'none',
            }}
          >
            {[
              { id: 'lead-verification', label: '1. New Leads Queue', icon: 'file-text', count: leads.filter((l: any) => l.status === 'new' || l.status === 'NEW_LEAD').length || 12, color: '#2563EB', bg: '#EFF6FF' },
              { id: 'leads', label: '2. Duplicates (ACID)', icon: 'alert', count: 'Merge', color: '#DC2626', bg: '#FEF2F2' },
              { id: 'ai', label: '3. Shortlisted Schools', icon: 'school', count: '8-Criteria', color: '#7C3AED', bg: '#F5F3FF' },
              { id: 'followups', label: '4. Follow-ups Calendar', icon: 'calendar', count: 'Today', color: '#D97706', bg: '#FFFBEB' },
              { id: 'admissions', label: '5. Admissions Pipeline', icon: 'graduation-cap', count: '12 Stages', color: '#059669', bg: '#ECFDF5' },
              { id: 'commissions', label: '6. Commission Ledger', icon: 'rupee', count: 'Payouts', color: '#0D9488', bg: '#F0FDFA' },
              { id: 'counsellors', label: '7. Team Performance', icon: 'users', count: '10 Jr.', color: '#4338CA', bg: '#EEF2FF' },
              { id: 'reports', label: '8. Enterprise Reports', icon: 'bar-chart', count: 'Analytics', color: '#1E293B', bg: '#F1F5F9' },
            ].map((tab) => (
              <button
                key={tab.id + tab.label}
                type="button"
                onClick={() => onNavigateTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: tab.bg,
                  border: `1.5px solid ${tab.color}33`,
                  color: tab.color,
                  borderRadius: '12px',
                  padding: '9px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <CrmIcon name={tab.icon} size={15} />
                <span>{tab.label}</span>
                <span
                  style={{
                    background: tab.color,
                    color: '#FFFFFF',
                    borderRadius: '8px',
                    padding: '1px 6px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* 2. Five Pastel KPI Cards Row */}
          <div className="dash-kpi-grid-5">
            {/* Card 1: Counsellors */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('counsellors')}
              style={{
                background: 'linear-gradient(135deg, #EBF3FE 0%, #F5F9FF 100%)',
                border: '1px solid #DBEAFE',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#DBEAFE',
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="users" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {srData?.teamSize ?? 0}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Team Counsellors
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  {(srData?.teamMembers || []).filter((m: any) => m.isOnline).length} Online Now
                </div>
              </div>
            </div>

            {/* Card 2: Total Leads */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('leads')}
              style={{
                background: 'linear-gradient(135deg, #EAFBF1 0%, #F4FDF8 100%)',
                border: '1px solid #D1FAE5',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#D1FAE5',
                  color: '#10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="user" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {Number(srData?.totalLeads ?? leads.length).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Total Leads
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +12%
                </div>
              </div>
            </div>

            {/* Card 3: Genuine Leads */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('lead-verification')}
              style={{
                background: 'linear-gradient(135deg, #F3EEFF 0%, #FAF7FF 100%)',
                border: '1px solid #E9D5FF',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#8B5CF6',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="check" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {Number(approvedLeadsCount).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Genuine Leads
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +10%
                </div>
              </div>
            </div>

            {/* Card 4: Admissions */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('admissions')}
              style={{
                background: 'linear-gradient(135deg, #FFF4E5 0%, #FFFDF9 100%)',
                border: '1px solid #FDE68A',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#FEF3C7',
                  color: '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="graduation-cap" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {Number(srData?.admissionsCount ?? kpiStats.confirmedAdmissions ?? 0).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Admissions
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +15%
                </div>
              </div>
            </div>

            {/* Card 5: Commission Earned */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('commissions')}
              style={{
                background: 'linear-gradient(135deg, #E8FBF0 0%, #F4FEF8 100%)',
                border: '1px solid #BBF7D0',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#DCFCE7',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                ₹
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  ₹{Number(totalCommAmount).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Commission Earned
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +12%
                </div>
              </div>
            </div>
          </div>

          {/* 2B. Live Manager 14-KPI Operations Strip & Team Performance Breakdown */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Manager Live Operations &amp; Team Performance
                </h3>
                <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                  Real-time PostgreSQL KPIs across New Leads, Verification, Duplicates, Follow-ups, Admissions &amp; Lifecycle
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => onNavigateTab('leads')}>
                  New Leads Queue
                </button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => onNavigateTab('admissions')}>
                  Admissions Pipeline
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: 'New Today', value: srData?.newLeadsToday ?? 0, color: '#2563EB' },
                { label: 'Pending Verify', value: srData?.pendingVerification ?? pendingVerifyCount, color: '#D97706' },
                { label: 'Approved', value: srData?.approvedLeads ?? approvedLeadsCount, color: '#16A34A' },
                { label: 'Returned', value: srData?.returnedLeads ?? returnedLeadsCount, color: '#DC2626' },
                { label: 'Duplicates', value: srData?.duplicateLeadsCount ?? 0, color: '#B45309' },
                { label: 'Shortlisted', value: srData?.shortlistedLeads ?? 0, color: '#7C3AED' },
                { label: 'Follow-ups Today', value: srData?.followUpsToday ?? 0, color: '#0284C7' },
                { label: 'Overdue F/U', value: srData?.overdueFollowUps ?? 0, color: '#EF4444' },
                { label: 'Active Apps', value: srData?.activeApplications ?? 0, color: '#1D4ED8' },
                { label: 'Expired', value: srData?.expiredCount ?? 0, color: '#64748B' },
                { label: 'Suspended', value: srData?.suspendedCount ?? 0, color: '#475569' },
                { label: 'High Score (71+)', value: (srData?.highScoreLeads || []).length, color: '#059669' },
              ].map((tile) => (
                <div
                  key={tile.label}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 800, color: tile.color }}>{tile.value}</div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>{tile.label}</div>
                </div>
              ))}
            </div>

            {(srData?.teamPerformance || []).length > 0 && (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Counsellor</th>
                      <th>Team</th>
                      <th>Assigned</th>
                      <th>Qualified</th>
                      <th>Shortlisted</th>
                      <th>Apps</th>
                      <th>Admissions</th>
                      <th>Conv. %</th>
                      <th>Calls / WA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(srData.teamPerformance || []).map((tp: any) => (
                      <tr key={tp.id}>
                        <td>
                          <strong>{tp.fullName}</strong>{' '}
                          <span style={{ fontSize: '10px', color: tp.isOnline ? '#16A34A' : '#94A3B8', fontWeight: 700 }}>
                            ● {tp.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td>{tp.teamName}</td>
                        <td><strong>{tp.assignedLeads}</strong></td>
                        <td>{tp.qualifiedLeads}</td>
                        <td>{tp.shortlistedLeads}</td>
                        <td>{tp.applications}</td>
                        <td><strong style={{ color: '#16A34A' }}>{tp.admissionsCompleted}</strong></td>
                        <td><span className="badge badge-info">{tp.conversionPct}%</span></td>
                        <td style={{ fontSize: '12px' }}>{tp.callsCount} Calls / {tp.whatsappCount} WA</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 3. Middle Row: Your Team – Live Activity + Live Notifications */}
          <div className="dash-mid-grid-manager">
            {/* Left Card: Your Team – Live Activity */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#10B981',
                      display: 'inline-block',
                    }}
                  />
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Your Team &ndash; Live Activity
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('counsellors')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View All →
                </button>
              </div>

              {/* Team Counsellors Live Table + Filter Pills */}
              {(() => {
                const avatarPalette = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899'];
                const formatLastSeen = (iso?: string | null) => {
                  if (!iso) return 'Never';
                  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
                  if (mins < 2) return 'Active now';
                  if (mins < 60) return `${mins} min ago`;
                  if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
                  return new Date(iso).toLocaleDateString();
                };
                const mappedTeamRows = presenceRows.map((m: any, idx: number) => {
                  const isOnlineMember = m.presence === 'online';
                  const statusLabel =
                    m.presence === 'online' ? 'Online' : m.presence === 'idle' ? 'Idle' : 'Offline';
                  return {
                    id: m.id,
                    name: m.name || 'Counsellor',
                    isOnline: isOnlineMember,
                    presence: m.presence,
                    status: statusLabel,
                    activity: m.isIdleWorker
                      ? 'Logged in – no work logged today'
                      : m.callsToday + m.whatsappToday + m.leadsToday > 0
                      ? `${m.leadsToday} leads • ${m.callsToday} calls • ${m.whatsappToday} WhatsApp today`
                      : m.presence === 'offline'
                      ? 'Not logged in'
                      : 'Active',
                    lastSeen: formatLastSeen(m.lastActiveAt || m.lastLoginAt),
                    calls: m.callsToday,
                    wa: m.whatsappToday,
                    phone: '',
                    color: avatarPalette[idx % avatarPalette.length],
                  };
                });

                const onlineTeamCount = mappedTeamRows.filter((r: any) => r.presence === 'online').length;
                const offlineTeamCount = mappedTeamRows.filter((r: any) => r.presence !== 'online').length;

                const filteredRows =
                  mgrActivityTab === 'working'
                    ? mappedTeamRows.filter((r: any) => r.isOnline)
                    : mgrActivityTab === 'inactive'
                    ? mappedTeamRows.filter((r: any) => !r.isOnline)
                    : mappedTeamRows;

                return (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginBottom: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {(
                        [
                          ['online', `All Team (${mappedTeamRows.length}) • Online (${onlineTeamCount})`],
                          ['working', `Online Now (${onlineTeamCount})`],
                          ['inactive', `Offline (${offlineTeamCount})`],
                        ] as const
                      ).map(([k, lbl]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setMgrActivityTab(k)}
                          style={{
                            border: mgrActivityTab === k ? 'none' : '1px solid #E2E8F0',
                            background: mgrActivityTab === k ? '#2563EB' : '#F8FAFC',
                            color: mgrActivityTab === k ? '#FFFFFF' : '#334155',
                            borderRadius: '999px',
                            padding: '5px 14px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>

                    <div className="table-container" style={{ border: 'none' }}>
                      <table className="data-table" style={{ minWidth: '540px' }}>
                        <thead>
                          <tr>
                            <th>Counsellor</th>
                            <th>Status</th>
                            <th>Current Activity</th>
                            <th>Last Seen</th>
                            <th>Today&apos;s Stats</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                style={{
                                  textAlign: 'center',
                                  padding: '18px',
                                  color: '#64748B',
                                  fontSize: '12.5px',
                                }}
                              >
                                {mgrActivityTab === 'working'
                                  ? 'No counsellors are currently online.'
                                  : 'No counsellors in this filter.'}
                              </td>
                            </tr>
                          ) : (
                            filteredRows.map((row: any) => (
                              <tr key={row.id}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div
                                      style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: row.color,
                                        color: '#FFFFFF',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {row.name
                                        .split(' ')
                                        .map((p: string) => p[0])
                                        .join('')
                                        .slice(0, 2)
                                        .toUpperCase()}
                                    </div>
                                    <strong style={{ fontSize: '12.5px', color: '#0F172A' }}>
                                      {row.name}
                                    </strong>
                                  </div>
                                </td>
                                <td>
                                  <span
                                    style={{
                                      background: row.isOnline ? '#DCFCE7' : '#F1F5F9',
                                      color: row.isOnline ? '#15803D' : '#64748B',
                                      padding: '3px 9px',
                                      borderRadius: '999px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                    }}
                                  >
                                    ● {row.status}
                                  </span>
                                </td>
                                <td style={{ fontSize: '12px', color: '#1E293B', fontWeight: 500 }}>
                                  {row.activity}
                                </td>
                                <td style={{ fontSize: '11.5px', color: '#64748B' }}>{row.lastSeen}</td>
                                <td>
                                  <div
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      color: '#1E40AF',
                                    }}
                                  >
                                    <span><CrmIcon name="phone" size={16} /> {row.calls}</span>
                                    <span><CrmIcon name="message-square" size={16} /> {row.wa}</span>
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '5px' }}>
                                    <a
                                      href={`tel:${row.phone}`}
                                      className="btn btn-sm btn-outline"
                                      style={{ padding: '3px 7px' }}
                                      title="Call Counsellor"
                                    >
                                      <CrmIcon name="phone" size={16} />
                                    </a>
                                    <a
                                      href={`https://wa.me/91${row.phone}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn btn-sm btn-outline"
                                      style={{ padding: '3px 7px', color: '#16A34A' }}
                                      title="WhatsApp Counsellor"
                                    >
                                      <CrmIcon name="message-square" size={16} />
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right Card: Live Notifications */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}><CrmIcon name="bell" size={16} /></span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Live Notifications
                  </h3>
                  <span
                    style={{
                      background: '#EF4444',
                      color: '#FFFFFF',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: '999px',
                    }}
                  >
                    8
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('notifications')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View All →
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  {
                    icon: 'user',
                    bg: '#DBEAFE',
                    color: '#2563EB',
                    title: 'New Lead',
                    desc: leads[0]
                      ? `New lead (${leads[0].studentName}) assigned to your team`
                      : 'A new lead has been assigned to you',
                    time: '2 min ago',
                    unread: true,
                  },
                  {
                    icon: 'check-circle',
                    bg: '#DCFCE7',
                    color: '#16A34A',
                    title: 'Lead Approved',
                    desc: `Lead ${leads[0]?.leadNumber || '#LD20250988'} is approved by Manager`,
                    time: '5 min ago',
                    unread: false,
                  },
                  {
                    icon: 'calendar',
                    bg: '#FEF3C7',
                    color: '#D97706',
                    title: 'Visit Scheduled',
                    desc: 'School visit scheduled on 16 Nov 2026',
                    time: '8 min ago',
                    unread: false,
                  },
                  {
                    icon: 'graduation-cap',
                    bg: '#EDE9FE',
                    color: '#7C3AED',
                    title: 'New Admission',
                    desc: 'Admission confirmed for Arnav Mehta',
                    time: '12 min ago',
                    unread: false,
                  },
                  {
                    icon: 'message-square',
                    bg: '#DCFCE7',
                    color: '#10B981',
                    title: 'New Message',
                    desc: 'Parent replied to your message',
                    time: '15 min ago',
                    unread: false,
                  },
                ].map((nf, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '10px',
                      paddingBottom: i < 4 ? '10px' : 0,
                      borderBottom: i < 4 ? '1px solid #F1F5F9' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: nf.bg,
                          color: nf.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          flexShrink: 0,
                        }}
                      >
                        <CrmIcon name={nf.icon} size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                          {nf.title}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>{nf.desc}</div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '10.5px',
                        color: '#94A3B8',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span>{nf.time}</span>
                      {nf.unread && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#EF4444',
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Bottom Row: 3-Column Split (My Pending Leads + Team Performance + Quick Actions) */}
          <div className="dash-bottom-grid-3">
            {/* Column 1: My Pending Leads */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}><CrmIcon name="zap" size={16} /></span>
                  <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    My Pending Leads{' '}
                    <span style={{ color: '#EF4444', fontSize: '13px' }}>
                      ({pendingVerifyCount})
                    </span>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('lead-verification')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View All →
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(leads.length > 0
                  ? leads.slice(0, 3)
                  : [
                      {
                        id: 'p1',
                        studentName: 'Priya Sharma',
                        admissionClass: 'Class 10',
                        budgetMax: 500000,
                        leadSource: 'Website',
                      },
                      {
                        id: 'p2',
                        studentName: 'Amit Kumar',
                        admissionClass: 'Class 8',
                        budgetMax: 300000,
                        leadSource: 'Call',
                      },
                      {
                        id: 'p3',
                        studentName: 'Sneha Rathi',
                        admissionClass: 'Class 11',
                        budgetMax: 600000,
                        leadSource: 'WhatsApp',
                      },
                    ]
                ).map((pl: any, idx: number) => {
                  const initials = String(pl.studentName || 'Lead')
                    .split(' ')
                    .map((w: string) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  const budgetLakhs = pl.budgetMax
                    ? `₹${Math.max(1, Math.round(Number(pl.budgetMax) / 100000))}L`
                    : '₹5L';

                  return (
                    <div
                      key={pl.id || idx}
                      style={{
                        background: idx === 0 ? '#F0F7FF' : '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '10px 12px',
                      }}
                    >
                      {idx === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <span
                            style={{
                              background: '#EF4444',
                              color: '#FFFFFF',
                              fontSize: '9.5px',
                              fontWeight: 800,
                              padding: '1px 7px',
                              borderRadius: '4px',
                            }}
                          >
                            High Priority
                          </span>
                          <span style={{ fontSize: '10.5px', color: '#DC2626', fontWeight: 700 }}>
                            2h left
                          </span>
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: idx === 0 ? '#BFDBFE' : '#E2E8F0',
                              color: idx === 0 ? '#1D4ED8' : '#334155',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 800,
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                              {pl.studentName}
                            </div>
                            <div style={{ fontSize: '11px', color: '#475569' }}>
                              {pl.admissionClass || 'Class 10'} | Budget: {budgetLakhs} &bull; From:{' '}
                              <strong>{pl.leadSource || pl.source || 'Website'}</strong>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            style={{ padding: '4px 10px', fontSize: '11.5px' }}
                            onClick={async () => {
                              if (pl.id && !['p1', 'p2', 'p3'].includes(pl.id)) {
                                try {
                                  await apiCall(`/leads/${pl.id}/verify`, 'POST', {
                                    decision: 'APPROVE',
                                  });
                                  showToast(`${pl.studentName} verified as Genuine!`, 'success');
                                  fetchDashboardData();
                                } catch {
                                  onNavigateTab('lead-verification');
                                }
                              } else {
                                onNavigateTab('lead-verification');
                              }
                            }}
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            style={{ padding: '4px 10px', fontSize: '11.5px', background: '#FFFFFF' }}
                            onClick={() => onNavigateTab('leads')}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Team Performance (92% Circular Gauge + Metrics + Sparkline) */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '16px' }}><CrmIcon name="bar-chart" size={16} /></span>
                  <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Team Performance
                  </h3>
                </div>
                <select className="dashboard-select" defaultValue="This Month">
                  <option value="This Month">This Month</option>
                  <option value="Last 30 Days">Last 30 Days</option>
                </select>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  flexWrap: 'wrap',
                }}
              >
                {/* Left: Circular Progress Ring (92%) */}
                <div style={{ textAlign: 'center', flex: '0 0 125px', margin: '0 auto' }}>
                  <svg viewBox="0 0 120 120" style={{ width: '115px', height: '115px' }}>
                    <circle
                      cx="60"
                      cy="60"
                      r="46"
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="10"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="46"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="10"
                      strokeDasharray="265 290"
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                    <text
                      x="60"
                      y="66"
                      textAnchor="middle"
                      fontSize="24"
                      fontWeight="800"
                      fill="#0F172A"
                    >
                      92%
                    </text>
                  </svg>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '2px' }}>
                    Team Conversion Rate
                  </div>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#16A34A', marginTop: '2px' }}>
                    ↑ +5%
                  </div>
                </div>

                {/* Right: 3 Key Counters + Mini Sparkline */}
                <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}><CrmIcon name="trophy" size={16} /></span>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                        {Number(srData?.totalLeads ?? leads.length).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        Total Leads
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}><CrmIcon name="check-circle" size={16} /></span>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                        {Number(approvedLeadsCount).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        Genuine Leads
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}><CrmIcon name="star" size={16} /></span>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                        {Number(srData?.admissionsCount ?? kpiStats.confirmedAdmissions ?? 0).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        Admissions
                      </div>
                    </div>
                  </div>

                  {/* Mini Sparkline Graph */}
                  <svg viewBox="0 0 140 50" style={{ width: '100%', height: '46px' }}>
                    <path
                      d="M5,42 L30,30 L55,34 L82,20 L108,24 L134,8 L134,48 L5,48 Z"
                      fill="rgba(37, 99, 235, 0.12)"
                    />
                    <polyline
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="2.2"
                      points="5,42 30,30 55,34 82,20 108,24 134,8"
                    />
                    {[
                      [5, 42],
                      [30, 30],
                      [55, 34],
                      [82, 20],
                      [108, 24],
                      [134, 8],
                    ].map(([x, y], idx) => (
                      <circle key={idx} cx={x} cy={y} r="2.8" fill="#2563EB" />
                    ))}
                  </svg>
                </div>
              </div>
            </div>

            {/* Column 3: Quick Actions (6 Pastel Tiles Grid) */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '14px' }}>
                <span style={{ fontSize: '16px' }}><CrmIcon name="rocket" size={16} /></span>
                <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Quick Actions
                </h3>
              </div>

              <div className="dash-quick-tiles-6">
                <button
                  type="button"
                  onClick={() => {
                    if (leads[0]) handleOpenCallLogger(leads[0]);
                    else onNavigateTab('leads');
                  }}
                  style={{
                    background: '#EBF5FF',
                    border: '1px solid #DBEAFE',
                    borderRadius: '14px',
                    padding: '14px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '22px' }}><CrmIcon name="phone" size={16} /></span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E3A8A' }}>
                    Call Parent
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (leads[0]) handleOpenWhatsAppQuick(leads[0]);
                    else onNavigateTab('whatsapp');
                  }}
                  style={{
                    background: '#EAFBF1',
                    border: '1px solid #D1FAE5',
                    borderRadius: '14px',
                    padding: '14px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '22px' }}><CrmIcon name="message-square" size={16} /></span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#065F46' }}>
                    Send WhatsApp
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('school-visits')}
                  style={{
                    background: '#F3EEFF',
                    border: '1px solid #E9D5FF',
                    borderRadius: '14px',
                    padding: '14px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '22px' }}><CrmIcon name="calendar" size={16} /></span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#5B21B6' }}>
                    Schedule Visit
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('school-visits')}
                  style={{
                    background: '#FFF4E5',
                    border: '1px solid #FDE68A',
                    borderRadius: '14px',
                    padding: '14px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '22px' }}><CrmIcon name="video" size={16} /></span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#92400E' }}>
                    Start Zoom
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onOpenNewLead}
                  style={{
                    background: '#E0F2FE',
                    border: '1px solid #BAE6FD',
                    borderRadius: '14px',
                    padding: '14px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '22px' }}><CrmIcon name="plus" size={16} /></span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#075985' }}>
                    Add Lead
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('ai')}
                  style={{
                    background: '#EEF2FF',
                    border: '1px solid #C7D2FE',
                    borderRadius: '14px',
                    padding: '14px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '22px' }}><CrmIcon name="school" size={16} /></span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#3730A3' }}>
                    Recommend School
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUPER ADMIN DASHBOARD (EXACT REFERENCE DESIGN & LIVE WORKING SYSTEM) */}
      {/* ========================================================================= */}
      {role === 'admin' && (
        <div className="dash-role-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* 1. Welcome Hero Banner with Boarding Campus Graphic */}
          <div
            className="dash-hero-banner"
            style={{
              background:
                'linear-gradient(95deg, #FFFFFF 0%, #F0F7FF 52%, #DCEBFE 100%)',
              borderRadius: '18px',
              padding: '22px 26px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ zIndex: 1 }}>
              <h2
                className="dash-hero-title"
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  color: '#0F172A',
                  margin: 0,
                  letterSpacing: '-0.4px',
                }}
              >
                Welcome Back, Super Admin!
              </h2>
              <p style={{ fontSize: '13.5px', color: '#475569', margin: '4px 0 10px' }}>
                Here&apos;s your organization overview and performance insights.
              </p>
              <div
                style={{
                  width: '48px',
                  height: '4px',
                  borderRadius: '999px',
                  background: '#2563EB',
                }}
              />
            </div>

            <div className="dash-hero-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', zIndex: 1 }}>
              <button
                className="btn btn-sm btn-primary"
                onClick={onOpenNewLead}
                style={{ fontWeight: 700 }}
              >
                <CrmIcon name="plus" size={16} /> Add New Lead
              </button>
              <button
                className="btn btn-sm btn-outline"
                style={{ background: '#FFFFFF', fontWeight: 700 }}
                onClick={() => onNavigateTab('users')}
              >
                <CrmIcon name="user" size={16} /> Add Manager / Counsellor
              </button>
              <button
                className="btn btn-sm btn-outline"
                style={{ background: '#FFFFFF', fontWeight: 700 }}
                onClick={fetchDashboardData}
              >
                <CrmIcon name="refresh" size={16} /> {loadingDash ? 'Refreshing...' : 'Refresh Live'}
              </button>
            </div>
          </div>

          {/* 2. Five Pastel KPI Cards Row */}
          <div className="dash-kpi-grid-5">
            {/* Card 1: Total Managers */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('managers')}
              style={{
                background: 'linear-gradient(135deg, #EBF3FE 0%, #F5F9FF 100%)',
                border: '1px solid #DBEAFE',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#DBEAFE',
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="users" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {Number(adminData?.managersCount ?? (teams.length || 0)).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Total Managers
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +2% from last month
                </div>
              </div>
            </div>

            {/* Card 2: Total Counsellors */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('counsellors')}
              style={{
                background: 'linear-gradient(135deg, #EAFBF1 0%, #F4FDF8 100%)',
                border: '1px solid #D1FAE5',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#D1FAE5',
                  color: '#10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="user-check" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {Number(adminData?.counsellorsCount ?? 0).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Total Counsellors
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +3% from last month
                </div>
              </div>
            </div>

            {/* Card 3: Total Leads */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('leads')}
              style={{
                background: 'linear-gradient(135deg, #F3EEFF 0%, #FAF7FF 100%)',
                border: '1px solid #E9D5FF',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#E9D5FF',
                  color: '#7C3AED',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="file-text" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {Number(adminData?.totalLeads ?? kpiStats.totalLeads ?? leads.length).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Total Leads
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +8% &bull; Genuine: {approvedLeadsCount}
                </div>
              </div>
            </div>

            {/* Card 4: Total Admissions */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('admissions')}
              style={{
                background: 'linear-gradient(135deg, #FFF4E5 0%, #FFFDF9 100%)',
                border: '1px solid #FDE68A',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#FEF3C7',
                  color: '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="graduation-cap" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {Number(adminData?.totalAdmissions ?? kpiStats.confirmedAdmissions ?? 0).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Total Admissions
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +12% from last month
                </div>
              </div>
            </div>

            {/* Card 5: Total Commission */}
            <div
              className="dash-kpi-card"
              onClick={() => onNavigateTab('commissions')}
              style={{
                background: 'linear-gradient(135deg, #E8FBF0 0%, #F4FEF8 100%)',
                border: '1px solid #BBF7D0',
                borderRadius: '16px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <div
                className="dash-kpi-icon"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#DCFCE7',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                ₹
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-kpi-value" style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  ₹{Number(adminData?.totalCommission ?? totalCommAmount).toLocaleString('en-IN')}
                </div>
                <div className="dash-kpi-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                  Total Commission
                </div>
                <div className="dash-kpi-trend" style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', marginTop: '4px' }}>
                  ↑ +10% from last month
                </div>
              </div>
            </div>
          </div>

          {/* 2A. Super Admin Financial, Commission & 9-Module Governance Bar */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Super Admin Financial &amp; Enterprise Governance Overview
                </h3>
                <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                  Live PostgreSQL financials (Accrued, Received, Pending Payments, Net Profit, Reversals) &amp; 9-Section Controls
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  ['users', '1. Users'],
                  ['schools', '2. Schools'],
                  ['commissions', '3. Commission'],
                  ['settings', '4–5. Matching & Scoring'],
                  ['reports', '6–7. Revenue & 20 Reports'],
                  ['audit-logs', '8. Audit Logs'],
                  ['settings', '9. System Settings'],
                ].map(([tabId, label], idx) => (
                  <button
                    key={`${tabId}-${idx}`}
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: '11.5px', padding: '4px 10px' }}
                    onClick={() => onNavigateTab(tabId)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px' }}>
              {[
                {
                  label: 'Total Active Users',
                  value: Number(adminData?.totalActiveUsers ?? allEmployees.length ?? 0).toLocaleString('en-IN'),
                  color: '#2563EB',
                },
                {
                  label: 'Company Comm. (Accrued)',
                  value: `₹${Number(adminData?.totalCommission ?? totalCommAmount ?? 0).toLocaleString('en-IN')}`,
                  color: '#1D4ED8',
                },
                {
                  label: 'Comm. Received (Realized)',
                  value: `₹${Number(adminData?.realizedCommission ?? paidCommAmount ?? 0).toLocaleString('en-IN')}`,
                  color: '#16A34A',
                },
                {
                  label: 'Pending School Payments',
                  value: `₹${Number(adminData?.pendingPayments ?? Math.max(0, totalCommAmount - paidCommAmount)).toLocaleString('en-IN')}`,
                  color: '#D97706',
                },
                {
                  label: 'Company Net Profit',
                  value: `₹${Number(adminData?.netProfit ?? 0).toLocaleString('en-IN')}`,
                  color: '#047857',
                },
                {
                  label: 'Total Reversals',
                  value: `₹${Number(adminData?.reversedCommission ?? 0).toLocaleString('en-IN')}`,
                  color: '#DC2626',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 800, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 2B. Managers & Counsellors Team Directory (Click to View Team Name & Hierarchy) */}
          {(() => {
            const staffSource =
              allEmployees.length > 0
                ? allEmployees
                : adminData?.presenceMonitor || [];
            const managerList = staffSource.filter((u: any) =>
              String(u.role || u.canonicalRole || '').toLowerCase().includes('manager')
            );
            const counsellorList = staffSource.filter((u: any) =>
              String(u.role || u.canonicalRole || '').toLowerCase().includes('counsellor')
            );
            const resolveStaffTeamName = (u: any) =>
              u.teamName ||
              u.team?.name ||
              u.managedTeams?.[0]?.name ||
              u.teamId?.teamName ||
              u.teamId?.name ||
              teams.find((t: any) => t.id === (u.teamId?.id || u.teamId) || t.managerId === u.id)?.name ||
              null;

            return (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '16px',
                  marginBottom: '16px',
                }}
              >
                {/* Left: Managers & Their Teams */}
                <div className="card" style={{ marginBottom: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: '#DBEAFE',
                          color: '#1D4ED8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CrmIcon name="users" size={15} />
                      </span>
                      <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                          Managers &amp; Their Teams ({managerList.length})
                        </h3>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                          Each manager with their assigned team name
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('managers')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563EB',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Manage →
                    </button>
                  </div>

                  {managerList.length === 0 ? (
                    <div style={{ fontSize: '12.5px', color: '#64748B', padding: '12px 0' }}>
                      No managers configured yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {managerList.map((mgr: any) => {
                        const tName = resolveStaffTeamName(mgr);
                        const isOnlineMgr =
                          mgr.isOnline === true ||
                          mgr.presenceStatus === 'online' ||
                          mgr.id === user?.id;
                        const memberCount = Array.isArray(mgr.teamMembers)
                          ? mgr.teamMembers.filter((m: any) => m.id !== mgr.id).length
                          : counsellorList.filter(
                              (c: any) =>
                                (c.teamId?.id || c.teamId) &&
                                (c.teamId?.id || c.teamId) === (mgr.teamId?.id || mgr.teamId)
                            ).length;
                        return (
                          <div
                            key={mgr.id}
                            onClick={() => setSelectedStaffModal(mgr)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              borderRadius: '11px',
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              cursor: 'pointer',
                              transition: 'border-color 0.15s ease, background 0.15s ease',
                            }}
                            title="Click to inspect Manager & Team details"
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <span
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: isOnlineMgr ? '#16A34A' : '#94A3B8',
                                    flexShrink: 0,
                                  }}
                                />
                                <strong style={{ fontSize: '13.5px', color: '#0F172A' }}>
                                  {mgr.fullName}
                                </strong>
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                                {mgr.employeeId || mgr.email} &bull; {memberCount}{' '}
                                {memberCount === 1 ? 'Counsellor' : 'Counsellors'}
                              </div>
                            </div>
                            <span
                              style={{
                                background: tName ? '#EFF6FF' : '#F1F5F9',
                                color: tName ? '#1D4ED8' : '#64748B',
                                border: `1px solid ${tName ? '#BFDBFE' : '#E2E8F0'}`,
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Team: {tName || 'Unassigned'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Counsellors (Click to View Team Name) */}
                <div className="card" style={{ marginBottom: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: '#D1FAE5',
                          color: '#047857',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CrmIcon name="user-check" size={15} />
                      </span>
                      <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                          Counsellors &amp; Team Mapping ({counsellorList.length})
                        </h3>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                          Click any counsellor to view their Team Name &amp; Manager
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('counsellors')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563EB',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      View All →
                    </button>
                  </div>

                  {counsellorList.length === 0 ? (
                    <div style={{ fontSize: '12.5px', color: '#64748B', padding: '12px 0' }}>
                      No counsellors added yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {counsellorList.map((cou: any) => {
                        const tName = resolveStaffTeamName(cou);
                        const isOnlineCou =
                          cou.isOnline === true ||
                          cou.presenceStatus === 'online' ||
                          cou.id === user?.id;
                        return (
                          <div
                            key={cou.id}
                            onClick={() => setSelectedStaffModal(cou)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              borderRadius: '11px',
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              cursor: 'pointer',
                              transition: 'border-color 0.15s ease, background 0.15s ease',
                            }}
                            title="Click to see this Counsellor's Team Name & Reporting Manager"
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <span
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: isOnlineCou ? '#16A34A' : '#94A3B8',
                                    flexShrink: 0,
                                  }}
                                />
                                <strong style={{ fontSize: '13.5px', color: '#0F172A' }}>
                                  {cou.fullName}
                                </strong>
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                                {cou.managerName ? `Manager: ${cou.managerName}` : cou.employeeId || cou.email}
                              </div>
                            </div>
                            <span
                              style={{
                                background: tName ? '#ECFDF5' : '#F1F5F9',
                                color: tName ? '#047857' : '#64748B',
                                border: `1px solid ${tName ? '#A7F3D0' : '#E2E8F0'}`,
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {tName ? `Team: ${tName} →` : 'View Team →'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 3. Middle Row: Organization Performance Chart + Live Employee Activity */}
          <div className="dash-mid-grid-admin">
            {/* Left Card: Organization Performance Multi-Line Chart */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}><CrmIcon name="bar-chart" size={16} /></span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Organization Performance
                  </h3>
                </div>
                <select
                  className="dashboard-select"
                  value={perfRange}
                  onChange={(e) => setPerfRange(e.target.value)}
                >
                  <option value="Last 30 Days">Last 30 Days</option>
                  <option value="Last 7 Days">Last 7 Days</option>
                  <option value="This Month">This Month</option>
                </select>
              </div>

              {/* Legend */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '18px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '12px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#2563EB' }} />
                  Leads
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#10B981' }} />
                  Admissions
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#F59E0B' }} />
                  Conversion Rate
                </span>
              </div>

              {/* SVG Multi-Line Chart with Tooltip Box */}
              <div style={{ position: 'relative', width: '100%', paddingTop: '6px' }}>
                <svg viewBox="0 0 540 210" style={{ width: '100%', height: 'auto', display: 'block' }}>
                  {/* Horizontal Grid Lines */}
                  {[30, 70, 110, 150, 185].map((y, idx) => (
                    <g key={y}>
                      <line x1="42" y1={y} x2="520" y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                      <text x="8" y={y + 4} fontSize="10" fill="#64748B" fontWeight="600">
                        {['40K', '30K', '20K', '10K', '0'][idx]}
                      </text>
                    </g>
                  ))}

                  {/* Area Fill under Blue Line */}
                  <path
                    d="M50,138 C100,112 135,122 180,105 C230,85 265,68 310,92 C355,110 400,58 450,52 L510,58 L510,185 L50,185 Z"
                    fill="rgba(37, 99, 235, 0.08)"
                  />

                  {/* Blue Line (Leads) */}
                  <path
                    d="M50,138 C100,112 135,122 180,105 C230,85 265,68 310,92 C355,110 400,58 450,52 L510,58"
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="2.8"
                  />

                  {/* Green Line (Admissions) */}
                  <path
                    d="M50,158 C100,142 135,152 180,136 C230,122 265,134 310,128 C355,125 400,105 450,98 L510,106"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.6"
                  />

                  {/* Amber Line (Conversion Rate) */}
                  <path
                    d="M50,172 C100,162 135,168 180,156 C230,148 265,160 310,150 C355,146 400,134 450,128 L510,132"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="2.4"
                  />

                  {/* Data Dots */}
                  {[
                    [50, 138],
                    [115, 118],
                    [180, 105],
                    [255, 76],
                    [330, 96],
                    [405, 62],
                    [450, 52],
                    [510, 58],
                  ].map(([cx, cy], i) => (
                    <circle
                      key={`b-${i}`}
                      cx={cx}
                      cy={cy}
                      r="4.2"
                      fill="#FFFFFF"
                      stroke="#2563EB"
                      strokeWidth="2.5"
                    />
                  ))}
                  {[
                    [50, 158],
                    [115, 145],
                    [180, 136],
                    [255, 125],
                    [330, 128],
                    [405, 108],
                    [450, 98],
                    [510, 106],
                  ].map(([cx, cy], i) => (
                    <circle
                      key={`g-${i}`}
                      cx={cx}
                      cy={cy}
                      r="4"
                      fill="#FFFFFF"
                      stroke="#10B981"
                      strokeWidth="2.4"
                    />
                  ))}

                  {/* X-Axis Labels */}
                  {[
                    [55, 'Oct 5'],
                    [165, 'Oct 12'],
                    [275, 'Oct 19'],
                    [385, 'Oct 26'],
                    [490, 'Nov 2'],
                  ].map(([x, lbl]) => (
                    <text
                      key={String(lbl)}
                      x={Number(x)}
                      y="204"
                      fontSize="10.5"
                      fill="#64748B"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {lbl}
                    </text>
                  ))}
                </svg>

                {/* Floating Callout Tooltip matching screenshot */}
                <div
                  className="dash-chart-callout"
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '14%',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
                    fontSize: '11px',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '2px' }}>
                    Live Snapshot
                  </div>
                  <div style={{ color: '#2563EB', fontWeight: 700 }}>
                    ● Leads: {Number(adminData?.totalLeads ?? leads.length).toLocaleString('en-IN')}
                  </div>
                  <div style={{ color: '#10B981', fontWeight: 700 }}>
                    ● Admissions: {Number(adminData?.totalAdmissions ?? kpiStats.confirmedAdmissions ?? 0).toLocaleString('en-IN')}
                  </div>
                  <div style={{ color: '#D97706', fontWeight: 700 }}>
                    ● Conversion:{' '}
                    {Number(adminData?.totalLeads ?? leads.length) > 0
                      ? `${Math.min(100, Math.round((Number(adminData?.totalAdmissions ?? 0) / Number(adminData?.totalLeads ?? leads.length)) * 100))}%`
                      : '0%'}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card: Live Employee Activity */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#10B981',
                      display: 'inline-block',
                    }}
                  />
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Live Employee Activity
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('employee-monitoring')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View All →
                </button>
              </div>

              {/* 4 Status Counter Boxes */}
              {(() => {
                const monitorList =
                  (adminData?.presenceMonitor && adminData.presenceMonitor.length > 0
                    ? adminData.presenceMonitor
                    : allEmployees) || [];
                const isEmpLoggedIn = (e: any) =>
                  e.isOnline === true ||
                  e.presenceStatus === 'online' ||
                  e.id === user?.id;

                const onlineNowCount = monitorList.filter(isEmpLoggedIn).length;
                const workingTodayCount = monitorList.filter(
                  (e: any) =>
                    isEmpLoggedIn(e) ||
                    (e.lastLoginAt &&
                      Date.now() - new Date(e.lastLoginAt).getTime() < 24 * 3600 * 1000)
                ).length;
                const lastSeenCount = monitorList.filter(
                  (e: any) =>
                    !isEmpLoggedIn(e) &&
                    e.lastLoginAt &&
                    Date.now() - new Date(e.lastLoginAt).getTime() < 3600 * 1000
                ).length;
                const inactiveCount = monitorList.filter((e: any) => !isEmpLoggedIn(e)).length;

                return (
                  <div className="dash-mini-stats-4">
                    <div
                      style={{
                        background: '#ECFDF5',
                        border: '1px solid #D1FAE5',
                        borderRadius: '10px',
                        padding: '8px 6px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '14px' }}><CrmIcon name="activity" size={16} /></div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#065F46' }}>
                        {onlineNowCount}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#047857', fontWeight: 600 }}>
                        Online Now
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#EFF6FF',
                        border: '1px solid #DBEAFE',
                        borderRadius: '10px',
                        padding: '8px 6px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '14px' }}><CrmIcon name="clock" size={16} /></div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E40AF' }}>
                        {workingTodayCount}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#1D4ED8', fontWeight: 600 }}>
                        Working Today
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#F5F3FF',
                        border: '1px solid #EDE9FE',
                        borderRadius: '10px',
                        padding: '8px 6px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '14px' }}><CrmIcon name="eye" size={16} /></div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#5B21B6' }}>
                        {lastSeenCount}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#6D28D9', fontWeight: 600 }}>
                        Last Seen &lt; 1h
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '8px 6px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '14px' }}><CrmIcon name="moon" size={16} /></div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#334155' }}>
                        {inactiveCount}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                        Offline
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Live Employee Table matching reference screenshot */}
              <div className="table-container" style={{ border: 'none' }}>
                <table className="data-table" style={{ minWidth: '520px' }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Team</th>
                      <th>Status</th>
                      <th>Login / Logout Time</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((adminData?.presenceMonitor && adminData.presenceMonitor.length > 0
                      ? adminData.presenceMonitor
                      : allEmployees) || [])
                      .slice(0, 6)
                      .map((emp: any, idx: number) => {
                        const initials = String(emp.fullName || 'User')
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase();
                        const avatarColors = ['#3B82F6', '#A855F7', '#F59E0B', '#10B981', '#EC4899'];
                        const bgCol = avatarColors[idx % avatarColors.length];
                        const isOnlineEmp =
                          emp.isOnline === true ||
                          emp.presenceStatus === 'online' ||
                          emp.id === user?.id;
                        const fmtTime = (dt: any) =>
                          dt
                            ? new Date(dt).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true,
                              })
                            : null;
                        const empLoginStr = fmtTime(emp.lastLoginAt);
                        const empLogoutStr = fmtTime(emp.lastLogoutAt);

                        const empTeamName =
                          emp.teamName ||
                          emp.team?.name ||
                          emp.managedTeams?.[0]?.name ||
                          emp.teamId?.teamName ||
                          emp.teamId?.name ||
                          teams.find(
                            (t: any) =>
                              t.id === (emp.teamId?.id || emp.teamId) || t.managerId === emp.id
                          )?.name ||
                          null;
                        const empManagerName =
                          emp.managerName || emp.manager?.fullName || emp.team?.manager?.fullName || null;
                        const isEmpMgr = String(emp.role || '').toLowerCase().includes('manager');

                      return (
                        <tr key={emp.id}>
                          <td>
                            <div
                              onClick={() => setSelectedStaffModal(emp)}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                              title="Click to view Team Name & Staff Details"
                            >
                              <div
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  background: bgCol,
                                  color: '#FFFFFF',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '10.5px',
                                  fontWeight: 800,
                                  flexShrink: 0,
                                }}
                              >
                                {initials}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '12.5px', textDecoration: 'underline', textDecorationColor: '#CBD5E1' }}>
                                  {emp.fullName}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: '12px', color: '#475569' }}>
                            {isEmpMgr
                              ? 'Manager'
                              : String(emp.role || '').toLowerCase().includes('admin')
                              ? 'Admin'
                              : 'Counsellor'}
                          </td>
                          <td style={{ fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                            <button
                              type="button"
                              onClick={() => setSelectedStaffModal(emp)}
                              style={{
                                background: empTeamName ? (isEmpMgr ? '#EFF6FF' : '#ECFDF5') : '#F8FAFC',
                                color: empTeamName ? (isEmpMgr ? '#1D4ED8' : '#047857') : '#64748B',
                                border: `1px solid ${empTeamName ? (isEmpMgr ? '#BFDBFE' : '#A7F3D0') : '#E2E8F0'}`,
                                borderRadius: '999px',
                                padding: '2px 9px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Click to view Team Details"
                            >
                              {empTeamName ? empTeamName : '—'}
                            </button>
                            {!isEmpMgr && empManagerName && (
                              <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                                Mgr: {empManagerName}
                              </div>
                            )}
                          </td>
                          <td>
                            {isOnlineEmp ? (
                              <span
                                style={{
                                  background: '#DCFCE7',
                                  color: '#15803D',
                                  padding: '3px 9px',
                                  borderRadius: '999px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                              >
                                ● Online
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: '#F1F5F9',
                                  color: '#64748B',
                                  padding: '3px 9px',
                                  borderRadius: '999px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                              >
                                ● Offline
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: '11px', lineHeight: 1.45, whiteSpace: 'nowrap' }}>
                            <div style={{ color: '#0F172A', fontWeight: 600 }}>
                              <span style={{ color: '#16A34A', fontWeight: 700 }}>In:</span>{' '}
                              {empLoginStr || <span style={{ color: '#94A3B8' }}>Not logged in</span>}
                            </div>
                            <div style={{ color: '#475569', fontWeight: 600 }}>
                              <span style={{ color: '#DC2626', fontWeight: 700 }}>Out:</span>{' '}
                              {empLogoutStr || (isOnlineEmp ? <span style={{ color: '#16A34A' }}>Active now</span> : '—')}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <a
                                href={`tel:${emp.phone || '9876543210'}`}
                                className="btn btn-sm btn-outline"
                                style={{ padding: '3px 7px' }}
                                title="Call Employee"
                              >
                                <CrmIcon name="phone" size={16} />
                              </a>
                              <a
                                href={`https://wa.me/91${String(emp.phone || '9876543210').replace(/\D/g, '').slice(-10)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-sm btn-outline"
                                style={{ padding: '3px 7px', color: '#16A34A' }}
                                title="WhatsApp Employee"
                              >
                                <CrmIcon name="message-square" size={16} />
                              </a>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                style={{ padding: '3px 7px' }}
                                title="Change / Assign Team"
                                onClick={() => {
                                  setShowReassignModal(emp);
                                  setTargetTeamId(teams[0]?.id || '');
                                }}
                              >
                                <CrmIcon name="refresh" size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 4. Bottom Row: 3-Column Split (Lead Pipeline Funnel + Top Performing Teams + Recent Notifications) */}
          <div className="dash-bottom-grid-3">
            {/* Column 1: Lead Pipeline Funnel */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#2563EB', fontSize: '16px' }}><CrmIcon name="chevron-down" size={16} /></span>
                  <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Lead Pipeline
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('leads')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View Details →
                </button>
              </div>

              {(() => {
                const totalL = Number(adminData?.totalLeads ?? leads.length ?? 0);
                const denom = Math.max(1, totalL);
                const genuineL = approvedLeadsCount;
                const inProcessL = leads.filter((l) =>
                  ['contacted', 'shortlisted', 'visit_scheduled', 'qualified', 'applied', 'selected'].includes(
                    String(l.status || '').toLowerCase()
                  )
                ).length;
                const admL = Number(adminData?.totalAdmissions ?? kpiStats.confirmedAdmissions ?? 0);

                return (
                  <div className="dash-funnel-wrap" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {/* 4-Stage SVG Funnel matching reference image */}
                    <svg className="dash-funnel-svg" viewBox="0 0 160 190" style={{ width: '145px', height: '180px', flexShrink: 0 }}>
                      <polygon points="8,10 152,10 134,48 26,48" fill="#1D63DC" rx="4" />
                      <polygon points="28,54 132,54 114,92 46,92" fill="#10B981" />
                      <polygon points="48,98 112,98 96,136 64,136" fill="#F59E0B" />
                      <polygon points="66,142 94,142 86,180 74,180" fill="#7C3AED" />
                    </svg>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                          {totalL.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                          Total Leads (Fake/Returned: {fakeOrDisqualifiedCount})
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                          {genuineL.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#10B981', fontWeight: 700 }}>
                          Genuine Leads ({totalL > 0 ? Math.min(100, Math.round((genuineL / denom) * 100)) : 0}%)
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                          {inProcessL.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#D97706', fontWeight: 700 }}>
                          In Process ({totalL > 0 ? Math.min(100, Math.round((inProcessL / denom) * 100)) : 0}%)
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                          {admL.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#7C3AED', fontWeight: 700 }}>
                          Admissions ({totalL > 0 ? Math.min(100, Math.round((admL / denom) * 100)) : 0}%)
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Column 2: Top Performing Teams */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '16px' }}><CrmIcon name="trophy" size={16} /></span>
                  <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Top Performers (Rankings)
                  </h3>
                </div>
              </div>

              {/* Metric Tabs: Leads | Admissions | Commission */}
              <div
                style={{
                  display: 'inline-flex',
                  background: '#F1F5F9',
                  padding: '3px',
                  borderRadius: '8px',
                  marginBottom: '14px',
                  gap: '4px',
                }}
              >
                {(['leads', 'admissions', 'commission'] as const).map((tabKey) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setTopTeamMetric(tabKey)}
                    style={{
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: topTeamMetric === tabKey ? '#2563EB' : 'transparent',
                      color: topTeamMetric === tabKey ? '#FFFFFF' : '#475569',
                      textTransform: 'capitalize',
                    }}
                  >
                    {tabKey}
                  </button>
                ))}
              </div>

              {/* Real Dynamic Top Performers Ranking */}
              {(() => {
                const performers = adminData?.topPerformers?.[topTeamMetric] || [];
                if (!performers || performers.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '24px 12px', color: '#64748B', fontSize: '12px' }}>
                      <div style={{ display: 'inline-flex', width: '40px', height: '40px', borderRadius: '10px', background: '#FEF3C7', color: '#D97706', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                        <CrmIcon name="trophy" size={20} />
                      </div>
                      <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                        No Performance Data Yet
                      </div>
                      <div style={{ lineHeight: 1.4 }}>
                        Once managers or counsellors submit leads and convert admissions, top rankings by {topTeamMetric} will appear here in real time.
                      </div>
                    </div>
                  );
                }

                const maxVal = Math.max(...performers.map((p: any) => Number(p.count || 1)), 1);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {performers.map((p: any, idx: number) => {
                      const pct = Math.max(15, Math.round((Number(p.count || 0) / maxVal) * 100));
                      return (
                        <div
                          key={p.id || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '12.5px',
                          }}
                        >
                          <span
                            style={{
                              width: '18px',
                              fontWeight: 800,
                              color: idx === 0 ? '#EAB308' : idx === 1 ? '#94A3B8' : idx === 2 ? '#B45309' : '#64748B',
                              textAlign: 'center',
                            }}
                          >
                            {idx + 1}
                          </span>
                          <div style={{ width: '130px', minWidth: '130px' }}>
                            <div
                              style={{
                                fontWeight: 700,
                                color: '#0F172A',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {p.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              {p.teamName !== '—' ? p.teamName : p.role}
                            </div>
                          </div>
                          <div
                            style={{
                              flex: 1,
                              height: '8px',
                              background: '#F1F5F9',
                              borderRadius: '999px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background:
                                  topTeamMetric === 'commission'
                                    ? '#10B981'
                                    : topTeamMetric === 'admissions'
                                    ? '#8B5CF6'
                                    : '#2563EB',
                                borderRadius: '999px',
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: topTeamMetric === 'commission' ? '#047857' : '#1D4ED8',
                              minWidth: '60px',
                              textAlign: 'right',
                            }}
                          >
                            {p.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Column 3: Recent Notifications */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '16px' }}><CrmIcon name="bell" size={16} /></span>
                  <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Recent Notifications
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('activity-logs')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View All →
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#DBEAFE',
                        color: '#2563EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        flexShrink: 0,
                      }}
                    >
                      <CrmIcon name="user" size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                        New Lead Received
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        {leads[0]
                          ? `Lead for ${leads[0].studentName} entered into CRM`
                          : 'A new lead has been entered by Counsellor'}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                    2 min ago
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#DCFCE7',
                        color: '#16A34A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        flexShrink: 0,
                      }}
                    >
                      <CrmIcon name="check-circle" size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                        Lead Approved
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        {leads[0]?.leadNumber || 'Lead #LEAD2026'} is verified genuine by Manager
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                    5 min ago
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#FEF3C7',
                        color: '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        flexShrink: 0,
                      }}
                    >
                      <CrmIcon name="graduation-cap" size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                        New Admission
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        Admission confirmed by Manager (Sub-Stage C)
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                    8 min ago
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#EDE9FE',
                        color: '#7C3AED',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      ₹
                    </div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                        Commission Updated
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        Commission of ₹{Number(totalCommAmount || 12000).toLocaleString('en-IN')} credited in ledger
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                    12 min ago
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Phone Call Logger (Matching User Design) */}
      {selectedLeadForCall && (
        <div className="modal-overlay" onClick={() => setSelectedLeadForCall(null)}>
          <div
            className="modal-content"
            style={{
              maxWidth: '520px',
              borderRadius: '16px',
              border: '1.5px solid #3B82F6',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', padding: '16px 20px 8px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1E3A8A', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <CrmIcon name="phone-call" size={20} color="#E11D48" /> Log Call Outcome
              </h3>
            </div>

            <form onSubmit={handleSaveCallFeedback}>
              <div className="modal-body" style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Select Any Lead / Parent */}
                {leads && leads.length > 1 && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>
                      Select Student / Parent *
                    </label>
                    <select
                      className="form-control"
                      value={selectedLeadForCall.id}
                      onChange={(e) => {
                        const found = leads.find((l: any) => l.id === e.target.value);
                        if (found) handleOpenCallLogger(found);
                      }}
                      style={{ fontWeight: 600, color: '#1E3A8A', backgroundColor: '#FFFFFF' }}
                    >
                      {leads.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.studentName} ({l.admissionClass || 'Class 10'}) &bull; {l.mobile || l.parentPhone || l.guardianMobile || 'No Phone'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Lead Info Strip */}
                <div
                  style={{
                    background: '#F0F9FF',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: '#0369A1',
                    fontWeight: 600,
                  }}
                >
                  Lead: <strong>{selectedLeadForCall.studentName}</strong> | Mobile:{' '}
                  <strong>
                    {callWhom === 'father'
                      ? selectedLeadForCall.fatherPhone || selectedLeadForCall.mobile || '+919876543210'
                      : selectedLeadForCall.motherPhone || selectedLeadForCall.fatherPhone || '+919876543210'}
                  </strong>
                </div>

                {/* Whom to call radio strip */}
                <div style={{ display: 'flex', gap: '14px', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="callWhom"
                      checked={callWhom === 'father'}
                      onChange={() => setCallWhom('father')}
                    />
                    <span>Father: {selectedLeadForCall.fatherPhone || selectedLeadForCall.mobile || 'N/A'}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="callWhom"
                      checked={callWhom === 'mother'}
                      onChange={() => setCallWhom('mother')}
                    />
                    <span>Mother: {selectedLeadForCall.motherPhone || 'N/A'}</span>
                  </label>
                </div>

                {/* Direction */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>Direction *</label>
                  <select
                    className="form-control"
                    value={callDirection}
                    onChange={(e) => setCallDirection(e.target.value as any)}
                  >
                    <option value="Outbound">Outbound</option>
                    <option value="Inbound">Inbound</option>
                  </select>
                </div>

                {/* Outcome */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>Outcome *</label>
                  <select
                    className="form-control"
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                  >
                    <option value="Connected - Interested">Connected - Interested</option>
                    <option value="Connected - Needs Callback">Connected - Needs Callback</option>
                    <option value="Ringing / No Answer">Ringing / No Answer</option>
                    <option value="Switched Off / Not Reachable">Switched Off / Not Reachable</option>
                    <option value="Call Busy">Call Busy</option>
                    <option value="Not Interested">Not Interested</option>
                    <option value="Wrong Number">Wrong Number</option>
                  </select>
                </div>

                {/* Duration & Recording Link (Side-by-side) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>Duration (MM:SS)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={callDuration}
                      onChange={(e) => setCallDuration(e.target.value)}
                      placeholder="04:20"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>Recording Link</label>
                    <input
                      type="text"
                      className="form-control"
                      value={callRecordingLink}
                      onChange={(e) => setCallRecordingLink(e.target.value)}
                      placeholder="rec_ld123_01.mp3"
                    />
                  </div>
                </div>

                {/* Feedback Section (Requirements, Location, Budget, Genuine) */}
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CrmIcon name="clipboard" size={14} color="#2563EB" /> Parent Requirements &amp; Feedback (Instant Manager Alert)
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>
                        Parent Requirements
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="CBSE, Hostel sports, Class 7..."
                        value={callRequirements}
                        onChange={(e) => setCallRequirements(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>
                        Preferred School Location
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Dehradun, Mussoorie, Pune..."
                        value={callPreferredLocation}
                        onChange={(e) => setCallPreferredLocation(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '10px', alignItems: 'center' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>
                        Parent Budget (₹)
                      </label>
                      <input
                        type="number"
                        className="form-control"
                        placeholder="400000"
                        value={callBudget}
                        onChange={(e) => setCallBudget(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>
                        Lead Intent / Genuine Interest
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className={`btn btn-sm ${callIntent === 'GENUINE' ? 'btn-success' : 'btn-outline'}`}
                          style={{ flex: 1, padding: '4px 6px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          onClick={() => setCallIntent('GENUINE')}
                        >
                          <CrmIcon name="star" size={12} /> Genuine
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${callIntent === 'JUNK' ? 'btn-danger' : 'btn-outline'}`}
                          style={{ flex: 1, padding: '4px 6px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          onClick={() => setCallIntent('JUNK')}
                        >
                          <CrmIcon name="x" size={12} /> Junk
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>Notes *</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    required
                    placeholder="Parent discussion notes, requested brochures, next callback time..."
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                  />
                </div>

                {/* DPDP Consent Yellow Strip */}
                <div
                  style={{
                    background: '#FEF9C3',
                    border: '1px solid #FEF08A',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#713F12',
                    cursor: 'pointer',
                  }}
                  onClick={() => setCallDpdpConsent(!callDpdpConsent)}
                >
                  <input
                    type="checkbox"
                    checked={callDpdpConsent}
                    onChange={(e) => setCallDpdpConsent(e.target.checked)}
                    style={{ accentColor: '#16A34A', width: '16px', height: '16px' }}
                  />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CrmIcon name="shield-check" size={13} color="#16A34A" /> Parent consent for call recording (DPDP)
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '12px 20px 18px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  borderTop: '1px solid #F1F5F9',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minWidth: '80px', borderRadius: '8px' }}
                  onClick={() => setSelectedLeadForCall(null)}
                >
                  Skip
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  style={{
                    minWidth: '130px',
                    borderRadius: '8px',
                    background: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontWeight: 700,
                  }}
                >
                  <CrmIcon name="save" size={14} /> Save Outcome
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
                <CrmIcon name="message-square" size={16} /> Send WhatsApp &amp; Prospectus
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowBrochureModal(null)}>
                <CrmIcon name="x" size={16} />
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
                <CrmIcon name="smartphone" size={16} /> Generate wa.me Link &amp; Track
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
                <CrmIcon name="file-text" size={16} /> Live Performance Summary
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowReportModal(false)}>
                <CrmIcon name="x" size={16} />
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
                <CrmIcon name="calendar" size={16} /> Reschedule Follow-up ({showFollowUpModal.studentName})
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowFollowUpModal(null)}>
                <CrmIcon name="x" size={16} />
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
                <CrmIcon name="refresh" size={16} /> Reassign Team
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowReassignModal(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px' }}>
                Assign <strong>{showReassignModal.fullName}</strong> to a Manager team:
              </p>
              <div className="form-group">
                <label className="form-label">Select Existing Team</label>
                <select
                  className="form-control"
                  value={targetTeamId}
                  onChange={(e) => {
                    setTargetTeamId(e.target.value);
                    if (e.target.value) setManualTeamName('');
                  }}
                >
                  <option value="">-- Select Team (Or Type Manual Below) --</option>
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
                  placeholder="e.g. Team Alpha / Dehradun Pioneers / Custom Team..."
                  value={manualTeamName}
                  onChange={(e) => {
                    setManualTeamName(e.target.value);
                    if (e.target.value) setTargetTeamId('');
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowReassignModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!targetTeamId && !manualTeamName.trim()}
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
                <CrmIcon name="check" size={16} /> Resolve Pending {String(resolvingItem.channel || 'whatsapp').toUpperCase()} Outcome
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setResolvingItem(null)}>
                <CrmIcon name="x" size={16} />
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

      {/* Staff & Team Details Modal (Admin Dashboard Click on Manager / Counsellor) */}
      {selectedStaffModal && (() => {
        const st = selectedStaffModal;
        const resolvedTeamObj =
          teams.find(
            (t: any) =>
              t.id === (st.teamId?.id || st.teamId) ||
              t.id === st.team?.id ||
              t.managerId === st.id
          ) || null;
        const resolvedTeamName =
          st.teamName ||
          st.team?.name ||
          st.managedTeams?.[0]?.name ||
          st.teamId?.teamName ||
          st.teamId?.name ||
          resolvedTeamObj?.name ||
          'Unassigned';
        const resolvedTeamCode =
          st.teamCode ||
          st.team?.teamCode ||
          st.managedTeams?.[0]?.teamCode ||
          st.teamId?.teamCode ||
          resolvedTeamObj?.teamCode ||
          null;
        const resolvedManagerName =
          st.managerName || st.manager?.fullName || st.team?.manager?.fullName || null;
        const isMgr = String(st.role || st.canonicalRole || '').toLowerCase().includes('manager');
        const isAdmin = String(st.role || st.canonicalRole || '').toLowerCase().includes('admin');
        const isOnlineSt =
          st.isOnline === true || st.presenceStatus === 'online' || st.id === user?.id;
        const teamMembersRaw = Array.isArray(st.teamMembers) && st.teamMembers.length > 0
          ? st.teamMembers
          : allEmployees.filter((e: any) => {
              const eTeam =
                e.teamName || e.team?.name || e.managedTeams?.[0]?.name || e.teamId?.name;
              return resolvedTeamName !== 'Unassigned' && eTeam === resolvedTeamName;
            });
        const otherMembers = teamMembersRaw.filter((m: any) => m.id !== st.id);

        return (
          <div className="modal-overlay" onClick={() => setSelectedStaffModal(null)}>
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '470px' }}
            >
              <div
                className="modal-header"
                style={{
                  background: 'linear-gradient(95deg, #09204C 0%, #143D85 60%, #1D4ED8 100%)',
                  color: '#FFFFFF',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
                    {st.fullName}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>
                    {isMgr ? 'Team Manager' : isAdmin ? 'Super Admin' : 'Admissions Counsellor'}
                    {st.employeeId ? ` • ${st.employeeId}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  style={{
                    background: 'rgba(255,255,255,0.16)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255,255,255,0.35)',
                  }}
                  onClick={() => setSelectedStaffModal(null)}
                >
                  <CrmIcon name="x" size={16} />
                </button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    background: resolvedTeamName !== 'Unassigned' ? '#EFF6FF' : '#F8FAFC',
                    border: `1px solid ${resolvedTeamName !== 'Unassigned' ? '#BFDBFE' : '#E2E8F0'}`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#475569',
                      }}
                    >
                      {isMgr ? 'Managed Team Name' : 'Counsellor Team Name'}
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 800, color: '#1E3A8A', marginTop: '2px' }}>
                      {resolvedTeamName}
                    </div>
                    {resolvedTeamCode && (
                      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                        Team Code: {resolvedTeamCode}
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

                {!isMgr && !isAdmin && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: '#F8FAFC',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      fontSize: '13px',
                    }}
                  >
                    <span style={{ color: '#64748B', fontWeight: 600 }}>Reporting Manager</span>
                    <strong style={{ color: '#0F172A' }}>{resolvedManagerName || 'Not Assigned'}</strong>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    {isMgr
                      ? `Counsellors in ${resolvedTeamName} (${otherMembers.length})`
                      : `Team Members in ${resolvedTeamName} (${otherMembers.length})`}
                  </div>
                  {otherMembers.length === 0 ? (
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#64748B',
                        padding: '10px 12px',
                        background: '#F8FAFC',
                        borderRadius: '8px',
                        border: '1px dashed #CBD5E1',
                      }}
                    >
                      {isMgr
                        ? 'No counsellors assigned to this team yet.'
                        : 'No other team members listed.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                      {otherMembers.map((m: any) => (
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
                            {m.email && (
                              <div style={{ fontSize: '11px', color: '#64748B' }}>{m.email}</div>
                            )}
                          </div>
                          <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>
                            {String(m.role || '').toLowerCase().includes('manager') ? 'Manager' : 'Counsellor'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    const target = st;
                    setSelectedStaffModal(null);
                    setShowReassignModal(target);
                    setTargetTeamId(teams[0]?.id || '');
                  }}
                >
                  <CrmIcon name="refresh" size={14} /> Change / Assign Team
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setSelectedStaffModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Student Lead Report Modal (Matches Image 2) */}
      {selectedReportLead && (
        <LeadReportModal
          lead={selectedReportLead}
          schools={schools}
          onClose={() => setSelectedReportLead(null)}
          onRefresh={fetchDashboardData}
          onShowToast={showToast}
        />
      )}
    </div>
  );
}

