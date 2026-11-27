import React, { useEffect, useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { hasRole } from '../../lib/roles';

const POLICY_CLAUSES = [
  {
    num: '01',
    title: 'Purpose & Consent Collection',
    body: 'Parent and student contact details, academic preferences, and admission records are collected strictly for boarding school counselling, school matching, visit coordination, and admission processing. Explicit parent consent is captured on every lead entry form with an immutable timestamp.',
  },
  {
    num: '02',
    title: 'Data Retention Policy (3-Year Archival)',
    body: 'Inactive leads with no active admission or financial transaction are automatically eligible for archival after 3 years. Active admission, fee installment, and statutory commission records are preserved for business continuity and legal/tax compliance.',
  },
  {
    num: '03',
    title: 'Sensitive Data Encryption at Rest (AES-256-GCM)',
    body: 'All sensitive credentials — including staff bank account details, Two-Factor Authentication (2FA) secrets, and recovery backup codes — are encrypted at rest using AES-256-GCM authenticated encryption. Passwords are salted and hashed using bcrypt.',
  },
  {
    num: '04',
    title: 'Call Recording Consent & Storage',
    body: 'Whenever call recording is used during parent counselling, explicit verbal consent must be obtained from the parent and recorded in the CRM Call Logger. Recordings are stored securely with strict role-based access under the 3-year retention policy.',
  },
  {
    num: '05',
    title: 'Right to Data Deletion (Erasure Requests)',
    body: 'Parents or staff may submit a Data Deletion Request at any time via the Privacy & Compliance Center. Where legally applicable (outside mandatory tax/financial retention), Super Admin approves the request and permanently anonymizes personal identifiable information (PII) with a full audit log entry.',
  },
];

export function PrivacyPolicyDocument() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div
        style={{
          background: 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 100%)',
          border: '1px solid #BFDBFE',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: '#DBEAFE',
            color: '#1D4ED8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CrmIcon name="shield" size={18} />
        </div>
        <div>
          <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#1E3A8A' }}>
            BoardingEdu Enterprise CRM — Data Privacy &amp; DPDP Act 2023 Policy (v2.0)
          </div>
          <div style={{ fontSize: '11.5px', color: '#2563EB', marginTop: '2px' }}>
            Applies to all Super Admins, Senior Managers, Counsellors, and Parent/Student admission records.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {POLICY_CLAUSES.map((clause) => (
          <div
            key={clause.num}
            style={{
              display: 'flex',
              gap: '12px',
              padding: '12px 14px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '11px',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: '#F1F5F9',
                color: '#1E3A8A',
                fontWeight: 800,
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '1px',
              }}
            >
              {clause.num}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                {clause.title}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.6 }}>
                {clause.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FirstLoginPrivacyModal({
  isOpen,
  onAccepted,
  onShowToast,
}: {
  isOpen: boolean;
  onAccepted: () => void;
  onShowToast?: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAccept = async () => {
    if (!checked) return;
    setSubmitting(true);
    try {
      await apiCall('/privacy/accept-policy', 'POST', { version: 'v2.0 (DPDP Act 2023)' });
      onAccepted();
      if (onShowToast) onShowToast('Privacy Policy accepted. Welcome to BoardingEdu CRM!', 'success');
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Could not save acceptance. Please retry.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div className="modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            background: 'linear-gradient(120deg, #07193B 0%, #103272 52%, #1D4ED8 100%)',
            color: '#FFFFFF',
            padding: '16px 20px',
            borderRadius: '14px 14px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CrmIcon name="shield" size={20} color="#FDE047" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>
                Data Privacy Policy &amp; Compliance Acceptance
              </h3>
              <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.85)' }}>
                Mandatory first-login acceptance under DPDP Act 2023
              </div>
            </div>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '56vh', overflowY: 'auto' }}>
          <PrivacyPolicyDocument />
        </div>

        <div
          className="modal-footer"
          style={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '12px',
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#0F172A',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ marginTop: '3px', width: '16px', height: '16px' }}
            />
            <span>
              I have read and accept the BoardingEdu Privacy Policy, AES-256 data security rules, Call Recording Consent rules, and 3-year DPDP Data Retention terms.
            </span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!checked || submitting}
              onClick={handleAccept}
            >
              {submitting ? 'Recording Acceptance...' : 'Accept & Continue to CRM'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrivacyComplianceView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const isAdmin = hasRole(user?.role, 'SUPER_ADMIN');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [runningRetention, setRunningRetention] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'policy' | 'deletion'>('overview');

  // Deletion Request Form State
  const [reqName, setReqName] = useState('');
  const [reqPhone, setReqPhone] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqLeadNo, setReqLeadNo] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [submittingDel, setSubmittingDel] = useState(false);

  const loadPrivacyStatus = async () => {
    setLoading(true);
    try {
      const res = await apiCall('/privacy/status');
      setStatus(res?.data || res);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to load privacy compliance status.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrivacyStatus();
  }, []);

  const handleRunRetention = async () => {
    setRunningRetention(true);
    try {
      const res = await apiCall('/privacy/retention-check', 'POST', {});
      onShowToast(res?.message || '3-Year Data Retention check completed!', 'success');
      loadPrivacyStatus();
    } catch (err: any) {
      onShowToast(err?.message || 'Retention check failed.', 'danger');
    } finally {
      setRunningRetention(false);
    }
  };

  const handleSubmitDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqName.trim() || (!reqPhone.trim() && !reqEmail.trim() && !reqLeadNo.trim())) {
      onShowToast('Please enter Requester Name and at least Phone, Email, or Lead ID.', 'warning');
      return;
    }
    setSubmittingDel(true);
    try {
      await apiCall('/privacy/deletion-requests', 'POST', {
        requesterName: reqName.trim(),
        phone: reqPhone.trim(),
        email: reqEmail.trim(),
        leadNumber: reqLeadNo.trim(),
        reason: reqReason.trim(),
      });
      onShowToast('Data Deletion Request submitted & logged for Super Admin review!', 'success');
      setReqName('');
      setReqPhone('');
      setReqEmail('');
      setReqLeadNo('');
      setReqReason('');
      loadPrivacyStatus();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to submit deletion request.', 'danger');
    } finally {
      setSubmittingDel(false);
    }
  };

  const handleProcessDeletion = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await apiCall(`/privacy/deletion-requests/${id}`, 'PUT', { decision });
      onShowToast(res?.message || `Request ${id} ${decision.toLowerCase()}.`, 'success');
      loadPrivacyStatus();
    } catch (err: any) {
      onShowToast(err?.message || 'Could not process deletion request.', 'danger');
    } finally {
      loadPrivacyStatus();
    }
  };

  const deletionRequests: any[] = status?.deletionRequests || [];
  const pendingDelCount = deletionRequests.filter((r) => r.status === 'PENDING').length;
  const consentRate = Number(status?.consentStats?.consentRate ?? 100);
  const consentedCalls = Number(status?.callRecordingStats?.consentedCalls ?? 0);
  const totalCalls = Number(status?.callRecordingStats?.totalCalls ?? 0);
  const callConsentPct = totalCalls > 0 ? Math.round((consentedCalls / totalCalls) * 100) : 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Executive Trust Center Hero Header */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(120deg, #07193B 0%, #103272 52%, #1D4ED8 100%)',
          color: '#FFFFFF',
          borderRadius: '20px',
          padding: '24px 26px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 14px 32px -8px rgba(15, 23, 42, 0.32)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: '-40px',
            top: '-60px',
            width: '220px',
            height: '220px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(96,165,250,0.28) 0%, rgba(29,78,216,0) 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative', zIndex: 1 }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.24)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CrmIcon name="shield" size={26} color="#FDE047" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  background: 'rgba(255,255,255,0.14)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  padding: '2px 9px',
                  borderRadius: '999px',
                  color: '#E0F2FE',
                }}
              >
                DPDP Act 2023 • Trust Center
              </span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  background: 'rgba(34, 197, 94, 0.2)',
                  border: '1px solid rgba(134, 239, 172, 0.45)',
                  padding: '2px 9px',
                  borderRadius: '999px',
                  color: '#DCFCE7',
                }}
              >
                6 / 6 Controls Active
              </span>
            </div>
            <h2 style={{ margin: '6px 0 0', fontSize: '21px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
              Data Privacy &amp; Compliance Center
            </h2>
            <div style={{ fontSize: '12.5px', color: 'rgba(226, 232, 240, 0.9)', marginTop: '3px' }}>
              Enterprise governance for Parent Consent, AES-256-GCM Encryption, 3-Year Archival &amp; Right to Erasure
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(16, 185, 129, 0.22)',
              border: '1px solid rgba(110, 231, 183, 0.5)',
              color: '#ECFDF5',
              padding: '7px 14px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 800,
            }}
          >
            <CrmIcon name="check-circle" size={14} color="#6EE7B7" />
            {status?.acceptedByCurrentUser ? 'Policy Accepted' : 'DPDP Active'}
          </div>
          <button
            type="button"
            onClick={loadPrivacyStatus}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#FFFFFF',
              color: '#0F172A',
              border: 'none',
              borderRadius: '10px',
              padding: '8px 15px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(15,23,42,0.16)',
            }}
          >
            <CrmIcon name="refresh" size={14} />
            {loading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>
      </div>

      {/* 2. Four Elevated Executive KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
        }}
      >
        {/* KPI 1: Consent Collection */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            borderTop: '3px solid #2563EB',
            padding: '16px 18px',
            boxShadow: '0 4px 14px -4px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', color: '#64748B', textTransform: 'uppercase' }}>
              Lead Consent Rate
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CrmIcon name="check-circle" size={16} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '8px', lineHeight: 1.1 }}>
            {loading ? '—' : `${consentRate}%`}
          </div>
          <div style={{ height: '6px', background: '#EFF6FF', borderRadius: '999px', overflow: 'hidden', margin: '10px 0 6px' }}>
            <div style={{ width: `${Math.min(100, consentRate)}%`, height: '100%', background: 'linear-gradient(90deg, #2563EB, #3B82F6)', borderRadius: '999px' }} />
          </div>
          <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
            {status?.consentStats?.consentedLeads ?? 0} of {status?.consentStats?.totalLeads ?? 0} leads verified
          </div>
        </div>

        {/* KPI 2: Sensitive Data Encryption */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            borderTop: '3px solid #10B981',
            padding: '16px 18px',
            boxShadow: '0 4px 14px -4px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', color: '#64748B', textTransform: 'uppercase' }}>
              Data Encryption
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CrmIcon name="lock" size={16} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginTop: '10px', lineHeight: 1.15 }}>
            AES-256-GCM
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '8px', background: '#ECFDF5', color: '#047857', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>
            <span>●</span> Active At Rest
          </div>
          <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600, marginTop: '6px' }}>
            Bank, 2FA Secrets &amp; Backup Codes
          </div>
        </div>

        {/* KPI 3: 3-Year Retention */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            borderTop: '3px solid #F59E0B',
            padding: '16px 18px',
            boxShadow: '0 4px 14px -4px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', color: '#64748B', textTransform: 'uppercase' }}>
              Data Retention
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#FFFBEB', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CrmIcon name="calendar" size={16} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '8px', lineHeight: 1.1 }}>
            3 Years
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', fontSize: '11.5px', fontWeight: 700 }}>
            <span style={{ color: '#B45309', background: '#FEF3C7', padding: '2px 8px', borderRadius: '999px' }}>
              {status?.retentionStats?.inactiveEligibleForArchive ?? 0} eligible
            </span>
            <span style={{ color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: '999px' }}>
              {status?.retentionStats?.archivedRecords ?? 0} archived
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600, marginTop: '6px' }}>
            Active admissions preserved
          </div>
        </div>

        {/* KPI 4: Call Recording Consent */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            borderTop: '3px solid #7C3AED',
            padding: '16px 18px',
            boxShadow: '0 4px 14px -4px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', color: '#64748B', textTransform: 'uppercase' }}>
              Call Recording Consent
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CrmIcon name="phone" size={16} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '8px', lineHeight: 1.1 }}>
            {consentedCalls} <span style={{ fontSize: '15px', fontWeight: 700, color: '#94A3B8' }}>/ {totalCalls}</span>
          </div>
          <div style={{ height: '6px', background: '#F5F3FF', borderRadius: '999px', overflow: 'hidden', margin: '10px 0 6px' }}>
            <div style={{ width: `${Math.min(100, callConsentPct)}%`, height: '100%', background: 'linear-gradient(90deg, #7C3AED, #A855F7)', borderRadius: '999px' }} />
          </div>
          <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
            Logged with 3-yr secure retention
          </div>
        </div>
      </div>

      {/* 3. Clean Segmented Navigation Bar */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          background: '#FFFFFF',
          padding: '6px',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          flexWrap: 'wrap',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
        }}
      >
        {[
          { id: 'overview', label: 'Overview & Security Controls', icon: 'shield' },
          { id: 'policy', label: 'Dedicated Privacy Policy (v2.0)', icon: 'file-text' },
          {
            id: 'deletion',
            label: `Data Deletion Requests${pendingDelCount > 0 ? ` (${pendingDelCount})` : ''}`,
            icon: 'trash',
          },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                flex: '1 1 180px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.16s ease',
                background: active ? 'linear-gradient(95deg, #0F2E6B 0%, #1D4ED8 100%)' : 'transparent',
                color: active ? '#FFFFFF' : '#475569',
                boxShadow: active ? '0 4px 12px rgba(29, 78, 216, 0.25)' : 'none',
              }}
            >
              <CrmIcon name={tab.icon} size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & SECURITY CONTROLS (Balanced 2-Column Layout — Zero Empty Space!) */}
      {activeTab === 'overview' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
            gap: '18px',
            alignItems: 'stretch',
          }}
        >
          {/* Left Card: 3-Year Retention Policy */}
          <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FFFBEB', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CrmIcon name="calendar" size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0F172A' }}>
                    Data Retention &amp; 3-Year Archival
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    Inactive leads archived after 3 years; active business records preserved
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: '#F8FAFC',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>Active Business Records</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>Preserved for ongoing admissions &amp; tax compliance</div>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#1D4ED8' }}>
                    {status?.retentionStats?.activeLeads ?? 0}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: '#FFFBEB',
                    borderRadius: '10px',
                    border: '1px solid #FDE68A',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#92400E' }}>Inactive (&gt; 3 Years) Eligible</div>
                    <div style={{ fontSize: '11.5px', color: '#B45309' }}>No active admission or financial transaction</div>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#B45309' }}>
                    {status?.retentionStats?.inactiveEligibleForArchive ?? 0}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: '#F0FDF4',
                    borderRadius: '10px',
                    border: '1px solid #BBF7D0',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#166534' }}>Archived Cold Records</div>
                    <div style={{ fontSize: '11.5px', color: '#15803D' }}>Safely archived under DPDP retention policy</div>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#15803D' }}>
                    {status?.retentionStats?.archivedRecords ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {isAdmin && (
              <div style={{ paddingTop: '6px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11.5px', color: '#64748B' }}>Super Admin Manual Archival Audit</span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={runningRetention}
                  onClick={handleRunRetention}
                >
                  <CrmIcon name="refresh" size={14} />{' '}
                  {runningRetention ? 'Scanning Records...' : 'Run 3-Year Retention Scan'}
                </button>
              </div>
            )}
          </div>

          {/* Right Card: Cryptographic Protection & Call Recording Governance */}
          <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CrmIcon name="lock" size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0F172A' }}>
                  Encryption &amp; Consent Governance
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Verified cryptographic safeguards &amp; parent call consent tracking
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                {
                  title: 'Staff Bank Account Details',
                  desc: `AES-256-GCM authenticated encryption (${status?.encryptionStatus?.encryptedBankAccounts ?? 0} encrypted)`,
                  badge: 'ENCRYPTED',
                  bg: '#ECFDF5',
                  color: '#047857',
                },
                {
                  title: '2FA TOTP Secrets & Backup Codes',
                  desc: `Encrypted at rest with bcrypt password hashing (${status?.encryptionStatus?.encryptedTwoFactorSecrets ?? 0} secrets)`,
                  badge: 'PROTECTED',
                  bg: '#ECFDF5',
                  color: '#047857',
                },
                {
                  title: 'Call Recording Consent Gate',
                  desc: 'Explicit verbal parent consent logged on every CRM call record under 3-year retention',
                  badge: 'ENFORCED',
                  bg: '#EFF6FF',
                  color: '#1D4ED8',
                },
                {
                  title: 'First-Login Policy Acceptance',
                  desc: status?.acceptedAt
                    ? `Accepted ${status.policyVersion || 'v2.0'} on ${new Date(status.acceptedAt).toLocaleString('en-IN')}`
                    : 'Mandatory acceptance enforced on first login',
                  badge: 'VERIFIED',
                  bg: '#F5F3FF',
                  color: '#6D28D9',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '11px 13px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{item.title}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>{item.desc}</div>
                  </div>
                  <span
                    style={{
                      background: item.bg,
                      color: item.color,
                      fontSize: '10px',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      padding: '4px 9px',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ● {item.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEDICATED PRIVACY POLICY (v2.0) */}
      {activeTab === 'policy' && (
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 className="card-title">
                <CrmIcon name="file-text" size={16} /> Dedicated Privacy Policy (v2.0)
              </h3>
              <span className="card-subtitle">
                {status?.acceptedAt
                  ? `Digitally accepted by ${user?.fullName || 'you'} on ${new Date(status.acceptedAt).toLocaleString('en-IN')}`
                  : 'Mandatory acceptance enforced on first login under DPDP Act 2023'}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => window.print()}
            >
              <CrmIcon name="download" size={14} /> Print / Save PDF
            </button>
          </div>
          <PrivacyPolicyDocument />
        </div>
      )}

      {/* TAB 3: DATA DELETION REQUESTS (RIGHT TO ERASURE) */}
      {activeTab === 'deletion' && (
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 className="card-title">
                <CrmIcon name="trash" size={16} /> Data Deletion Requests (Right to Erasure)
              </h3>
              <span className="card-subtitle">
                Parents or staff can submit a legal erasure request; Super Admin reviews &amp; anonymizes PII with full audit trail
              </span>
            </div>
          </div>

          <form
            onSubmit={handleSubmitDeletion}
            style={{
              background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '18px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              alignItems: 'end',
            }}
          >
            <div>
              <label className="form-label" style={{ fontSize: '11.5px' }}>Parent / User Name *</label>
              <input
                type="text"
                className="form-control"
                required
                placeholder="e.g. Rajesh Verma"
                value={reqName}
                onChange={(e) => setReqName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '11.5px' }}>Mobile Phone</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 9811001101"
                value={reqPhone}
                onChange={(e) => setReqPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '11.5px' }}>Email or Lead ID</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. LD-TEST-001"
                value={reqLeadNo || reqEmail}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.includes('@')) {
                    setReqEmail(v);
                    setReqLeadNo('');
                  } else {
                    setReqLeadNo(v);
                    setReqEmail('');
                  }
                }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '11.5px' }}>Reason for Deletion</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Parent withdrew admission"
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
              />
            </div>
            <div>
              <button
                type="submit"
                className="btn btn-danger btn-sm"
                disabled={submittingDel}
                style={{ width: '100%', padding: '10px 14px', fontWeight: 700 }}
              >
                {submittingDel ? 'Submitting...' : 'Submit Deletion Request'}
              </button>
            </div>
          </form>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Requester &amp; Identifier</th>
                  <th>Reason</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Action / Resolution</th>
                </tr>
              </thead>
              <tbody>
                {deletionRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748B' }}>
                      <div style={{ display: 'inline-flex', width: '44px', height: '44px', borderRadius: '12px', background: '#F1F5F9', color: '#64748B', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                        <CrmIcon name="shield" size={20} />
                      </div>
                      <div style={{ fontWeight: 700, color: '#334155', fontSize: '13.5px' }}>
                        No Data Deletion Requests Yet
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
                        All submitted erasure requests will appear here with full audit tracking.
                      </div>
                    </td>
                  </tr>
                ) : (
                  deletionRequests.map((r: any) => (
                    <tr key={r.id}>
                      <td><strong>{r.id}</strong></td>
                      <td>
                        <strong>{r.requesterName}</strong>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                          {[r.phone, r.email, r.leadNumber].filter(Boolean).join(' • ')}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px' }}>{r.reason}</td>
                      <td style={{ fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                        {r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '—'}
                        <div style={{ color: '#64748B', fontSize: '10.5px' }}>By: {r.submittedBy}</div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.status === 'APPROVED'
                              ? 'badge-success'
                              : r.status === 'REJECTED'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.status === 'PENDING' && isAdmin ? (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => handleProcessDeletion(r.id, 'APPROVED')}
                            >
                              Approve &amp; Erase PII
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => handleProcessDeletion(r.id, 'REJECTED')}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: '#475569' }}>
                            {r.resolutionNotes || 'Pending Super Admin review'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
