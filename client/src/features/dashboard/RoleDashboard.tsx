import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface RoleDashboardProps {
  onNavigateTab: (tab: string) => void;
  onOpenNewLead: () => void;
  leads: any[];
  commissions: any[];
  schools: any[];
  teams: any[];
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

  const role =
    effectiveRole === 'SUPER_ADMIN'
      ? 'admin'
      : effectiveRole === 'SENIOR_MANAGER'
      ? 'manager'
      : 'counsellor';

  // Local state for modals & actions
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'warning' | 'danger' } | null>(null);
  const [selectedLeadForCall, setSelectedLeadForCall] = useState<any | null>(null);
  const [callWhom, setCallWhom] = useState<'father' | 'mother'>('father');
  const [callOutcome, setCallOutcome] = useState('Connected & Spoke to Parent');
  const [callIntent, setCallIntent] = useState<'GENUINE' | 'JUNK'>('GENUINE');
  const [callNotes, setCallNotes] = useState('');
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'weekly' | 'monthly'>('monthly');

  // Manager specific states
  const [showRescheduleModal, setShowRescheduleModal] = useState<any | null>(null);
  const [newVisitDate, setNewVisitDate] = useState('2026-11-28');
  const [showBrochureModal, setShowBrochureModal] = useState<any | null>(null);

  // Admin specific states
  const [showReassignModal, setShowReassignModal] = useState<any | null>(null);
  const [targetTeam, setTargetTeam] = useState('Team Uttarakhand Pioneers');

  const showToast = (text: string, type: 'success' | 'warning' | 'danger' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const approvedCount = leads.filter((l) => l.verificationStatus === 'Approved').length;
  const pendingCount = leads.filter((l) => l.verificationStatus === 'Pending Verification').length;
  const returnedCount = leads.filter((l) => l.verificationStatus === 'Returned').length;
  const hotCount = leads.filter((l) => (l.leadPriority || 'Hot') === 'Hot').length;

  const totalCommAmount = commissions
    .filter((c) => c.amount > 0 && c.status !== 'Reversed')
    .reduce((s, c) => s + c.amount, 0);
  const paidCommAmount = commissions
    .filter((c) => c.amount > 0 && c.rawStatus === 'PAID')
    .reduce((s, c) => s + c.amount, 0);
  const pendingCommAmount = totalCommAmount - paidCommAmount;

  // Counsellor Specific Counts (Khushi Counsellor)
  const counsellorLeadsCount = leads.length > 3 ? leads.length : 100;
  const counsellorCallsCount = 100; // 100 parents contacted
  const counsellorGenuineCount = 60; // 60 genuine boarding parents
  const counsellorAdmissionsCount = 30; // 30 confirmed admissions
  const counsellorCommissionRate = 1000; // ₹1,000 per confirmed student
  const counsellorTotalCommission = counsellorAdmissionsCount * counsellorCommissionRate; // ₹30,000

  const handleSaveCallFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(
      `Call feedback logged for ${selectedLeadForCall?.studentName || 'Student'}! Status: ${
        callIntent === 'GENUINE' ? '🌟 Genuine Boarding Enquiry' : '❌ Not Genuine / Junk'
      }`,
      'success'
    );
    setSelectedLeadForCall(null);
    setCallNotes('');
  };

  const handleForwardToManager = () => {
    showToast(
      `Batch of ${counsellorGenuineCount} Genuine Boarding Leads successfully forwarded to Priya Manager for Verification!`,
      'success'
    );
    setShowForwardModal(false);
  };

  const handleSendReport = () => {
    showToast(
      `Official ${reportPeriod.toUpperCase()} Performance & Commission Report (₹${counsellorTotalCommission.toLocaleString('en-IN')}) successfully dispatched to Priya Manager & Super Admin!`,
      'success'
    );
    setShowReportModal(false);
  };

  return (
    <div>
      {/* Toast Notification */}
      {toastMsg && (
        <div className={`toast ${toastMsg.type}`} style={{ position: 'fixed', top: '70px', right: '20px', zIndex: 9999 }}>
          <span>{toastMsg.type === 'success' ? '✅' : toastMsg.type === 'danger' ? '❌' : '⚠️'}</span>{' '}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. COUNSELLOR DASHBOARD (Khushi Counsellor Workspace)                      */}
      {/* ========================================================================= */}
      {role === 'counsellor' && (
        <div>
          {/* Counsellor Live Shift & Status Banner */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '20px' }}>👩‍💼</span>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                    {user?.fullName || 'Khushi Sharma'} (EMP-COU-001)
                  </h2>
                  <span
                    style={{
                      background: '#16A34A',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%' }}></span>
                    🟢 Online &amp; Active on CRM
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', opacity: 0.9 }}>
                  🕒 <strong>Shift Login Time:</strong> 09:30 AM IST (Logged in by Admin) &bull; 🏢 <strong>Assigned Manager:</strong> Priya Rawat (Team: Uttarakhand Pioneers)
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm btn-white"
                  style={{ background: '#FFFFFF', color: '#123B70', fontWeight: 700 }}
                  onClick={onOpenNewLead}
                >
                  ➕ New Lead (Dual-Phone)
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: '#16A34A', color: '#FFFFFF', fontWeight: 700 }}
                  onClick={() => setShowForwardModal(true)}
                >
                  📤 Forward {counsellorGenuineCount} Genuine Leads to Manager
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: '#F59E0B', color: '#FFFFFF', fontWeight: 700 }}
                  onClick={() => setShowReportModal(true)}
                >
                  📄 My Performance &amp; Commission Report
                </button>
              </div>
            </div>
          </div>

          {/* Counsellor 4 Primary Metric Cards */}
          <div className="stats-grid">
            <div className="stat-card blue">
              <div className="stat-card-top">
                <span className="stat-label">My Total Leads</span>
                <div className="stat-icon">📥</div>
              </div>
              <div className="stat-value">{counsellorLeadsCount}</div>
              <div className="stat-trend">Total Assigned in Portfolio</div>
            </div>

            <div className="stat-card purple">
              <div className="stat-card-top">
                <span className="stat-label">Parents Spoken With</span>
                <div className="stat-icon">📞</div>
              </div>
              <div className="stat-value">{counsellorCallsCount}</div>
              <div className="stat-trend up">
                <span>↑</span> 100% Contact Rate
              </div>
            </div>

            <div className="stat-card amber">
              <div className="stat-card-top">
                <span className="stat-label">Genuine Boarding Leads</span>
                <div className="stat-icon">🌟</div>
              </div>
              <div className="stat-value">{counsellorGenuineCount}</div>
              <div className="stat-trend up">
                <span>↑</span> 60 Parents Ready for Boarding
              </div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Confirmed Admissions</span>
                <div className="stat-icon">🎓</div>
              </div>
              <div className="stat-value">{counsellorAdmissionsCount}</div>
              <div className="stat-trend up">
                <span>↑</span> 30 Enrolled in Residential Schools
              </div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">My Total Commission Earned</span>
                <div className="stat-icon">💰</div>
              </div>
              <div className="stat-value">₹{counsellorTotalCommission.toLocaleString('en-IN')}</div>
              <div className="stat-trend up">
                <span>↑</span> ₹{counsellorCommissionRate}/Student confirmed
              </div>
            </div>

            <div className="stat-card blue">
              <div className="stat-card-top">
                <span className="stat-label">Daily Admission Counter</span>
                <div className="stat-icon">📈</div>
              </div>
              <div className="stat-value">+₹1,000 Today</div>
              <div className="stat-trend">1 New Admission Closed Today</div>
            </div>

            <div className="stat-card purple">
              <div className="stat-card-top">
                <span className="stat-label">Paid Out Commission</span>
                <div className="stat-icon">🏦</div>
              </div>
              <div className="stat-value">₹{(15000).toLocaleString('en-IN')}</div>
              <div className="stat-trend">Credited via Bank Transfer</div>
            </div>

            <div className="stat-card amber">
              <div className="stat-card-top">
                <span className="stat-label">Pending Commission Approval</span>
                <div className="stat-icon">⏳</div>
              </div>
              <div className="stat-value">₹{(15000).toLocaleString('en-IN')}</div>
              <div className="stat-trend">With Manager &amp; Admin</div>
            </div>
          </div>

          {/* Counsellor Leads Worklist Table */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">📞 My Calling Queue &amp; Feedback Logger (Khushi)</h3>
                <span className="card-subtitle">
                  Call parents using dual-contacts (Father &amp; Mother), log structured feedback, and mark genuine intent.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-success">60 Verified Genuine</span>
                <span className="badge badge-warning">40 Pending Call / Follow-up</span>
              </div>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lead ID</th>
                    <th>Student Name</th>
                    <th>Class</th>
                    <th>Father Contact</th>
                    <th>Mother Contact (Mandatory #2)</th>
                    <th>Budget</th>
                    <th>Verification</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l._id || l.id}>
                      <td>
                        <strong style={{ color: 'var(--primary-navy)' }}>{l.leadId}</strong>
                      </td>
                      <td>
                        <strong>{l.studentId?.name || l.studentName}</strong>
                      </td>
                      <td>{l.studentId?.admissionClass || l.applyingForGrade || 'Class 6'}</td>
                      <td>
                        <span style={{ color: '#1E293B', fontWeight: 600 }}>
                          👨 {l.fatherPhone || l.parentId?.mobile || l.parentPhone || '+91 98765 43210'}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#0F766E', fontWeight: 600 }}>
                          👩 {l.motherPhone || '+91 98765 43211'}
                        </span>
                      </td>
                      <td>{l.annualBudget || '₹5.5L - ₹7.5L'}</td>
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
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            setSelectedLeadForCall(l);
                            setCallWhom('father');
                          }}
                        >
                          📞 Call &amp; Feedback
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Returned Leads by Manager Section */}
          <div className="card" style={{ borderColor: '#FCA5A5', background: '#FFF5F5' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title" style={{ color: '#991B1B' }}>
                  ↩️ Returned by Manager (Priya) – Needs Re-Confirmation
                </h3>
                <span className="card-subtitle">
                  If Manager returns a lead, re-call the parent, confirm boarding budget &amp; re-submit.
                </span>
              </div>
              <span className="badge badge-danger">1 Returned Lead</span>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lead ID</th>
                    <th>Student Name</th>
                    <th>Parent Details</th>
                    <th>Manager Priya's Return Remark</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>UBN-LD-000103</strong></td>
                    <td>Kabir Singhania (Class 9)</td>
                    <td>Col. R. Singhania (+91 98111 22334)</td>
                    <td>
                      <span style={{ color: '#DC2626', fontWeight: 600 }}>
                        &quot;Parent budget seems low for Woodstock IB curriculum. Re-confirm if willing to consider Sherwood ICSE Nainital.&quot;
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-navy"
                        onClick={() => {
                          setSelectedLeadForCall(leads[0] || { studentName: 'Kabir Singhania' });
                          setCallWhom('father');
                        }}
                      >
                        📞 Re-Call &amp; Re-Confirm
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SENIOR MANAGER DASHBOARD (Priya Manager Workspace)                      */}
      {/* ========================================================================= */}
      {role === 'manager' && (
        <div>
          {/* Manager Header Banner */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '22px' }}>👔</span>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                    Senior Manager: {user?.fullName || 'Priya Rawat'} (Team: Uttarakhand Pioneers)
                  </h2>
                </div>
                <div style={{ fontSize: '12.5px', opacity: 0.9, marginTop: '4px' }}>
                  Managing <strong>10 Active Counsellors</strong> (Khushi, Rahul, Amit, Sneha, Neha, Rohit, Pooja, Vikas, Anjali, Karan)
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="badge" style={{ background: 'white', color: '#16A34A', fontWeight: 800, fontSize: '12px' }}>
                  Target: 60 Admissions / Month
                </span>
              </div>
            </div>
          </div>

          {/* Inbound Alert from Khushi Counsellor */}
          <div
            className="card"
            style={{
              background: '#EFF6FF',
              border: '2px solid #3B82F6',
              padding: '14px 18px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🔔</span>
                <div>
                  <h4 style={{ color: '#1E3A8A', fontWeight: 800, margin: 0 }}>
                    Inbound Queue: Counsellor Khushi has forwarded 10 Genuine Boarding Leads for Verification!
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#1E40AF' }}>
                    All 10 leads have dual contact numbers (Father &amp; Mother) verified with confirmed budget.
                  </p>
                </div>
              </div>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => onNavigateTab('leads')}
              >
                Review &amp; Verify 10 Leads →
              </button>
            </div>
          </div>

          {/* Manager Stats */}
          <div className="stats-grid">
            <div className="stat-card blue">
              <div className="stat-card-top">
                <span className="stat-label">Total Team Leads</span>
                <div className="stat-icon">📥</div>
              </div>
              <div className="stat-value">{leads.length || 100}</div>
              <div className="stat-trend">Across 10 Counsellors</div>
            </div>

            <div className="stat-card amber">
              <div className="stat-card-top">
                <span className="stat-label">Pending Verification Queue</span>
                <div className="stat-icon">⏳</div>
              </div>
              <div className="stat-value">{pendingCount || 10}</div>
              <div className="stat-trend">Needs Manager Quality Check</div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Approved Genuine Leads</span>
                <div className="stat-icon">✅</div>
              </div>
              <div className="stat-value">{approvedCount || 60}</div>
              <div className="stat-trend">School Brochures Dispatched</div>
            </div>

            <div className="stat-card purple">
              <div className="stat-card-top">
                <span className="stat-label">Campus Visits Scheduled</span>
                <div className="stat-icon">🏫</div>
              </div>
              <div className="stat-value">18</div>
              <div className="stat-trend">Dehradun / Mussoorie / Nainital</div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Team Admissions</span>
                <div className="stat-icon">🎓</div>
              </div>
              <div className="stat-value">{kpiStats.teamAdmissions || 30}</div>
              <div className="stat-trend up">
                <span>↑</span> 50% Conversion Target
              </div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Team Commission</span>
                <div className="stat-icon">💰</div>
              </div>
              <div className="stat-value">₹{(totalCommAmount || 60000).toLocaleString('en-IN')}</div>
              <div className="stat-trend">Manager Override + Team Share</div>
            </div>
          </div>

          {/* Campus Visit Tracker with Reschedule follow-up */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">🏫 Campus Visit &amp; School Tour Coordinator (Manager View)</h3>
                <span className="card-subtitle">
                  Track upcoming visits, detect missed dates, and reschedule with parent follow-up.
                </span>
              </div>
              <span className="badge badge-navy">Uttarakhand Hub</span>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Counsellor</th>
                    <th>Target School</th>
                    <th>Scheduled Date</th>
                    <th>Visit Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Arjun Malhotra (Class 6)</strong></td>
                    <td>Khushi Sharma</td>
                    <td>The Doon School, Dehradun</td>
                    <td>25 Nov 2026, 11:00 AM</td>
                    <td><span className="badge badge-success">Visit Confirmed</span></td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => setShowBrochureModal({ name: 'The Doon School', parent: 'Sanjay Malhotra' })}
                      >
                        📱 Send WhatsApp Pass
                      </button>
                    </td>
                  </tr>
                  <tr style={{ background: '#FFFBEB' }}>
                    <td><strong>Devansh Joshi (Class 9)</strong></td>
                    <td>Khushi Sharma</td>
                    <td>Sherwood College, Nainital</td>
                    <td>12 Nov 2026 (Overdue)</td>
                    <td><span className="badge badge-danger">⚠️ Missed Visit</span></td>
                    <td>
                      <button
                        className="btn btn-sm btn-warning"
                        onClick={() => setShowRescheduleModal({ student: 'Devansh Joshi', counsellor: 'Khushi' })}
                      >
                        📅 Reschedule Visit Date
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUPER ADMIN DASHBOARD (Organization-Wide Master Control)                */}
      {/* ========================================================================= */}
      {role === 'admin' && (
        <div>
          {/* Admin Header */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  👑 Super Admin Master Operations Control
                </h2>
                <div style={{ fontSize: '12.5px', opacity: 0.9, marginTop: '4px' }}>
                  Managing <strong>100 Managers</strong>, <strong>1,000 Counsellors</strong>, and Global Financial Ledgers.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-white" style={{ background: '#FFFFFF', color: '#0F172A', fontWeight: 700 }} onClick={() => onNavigateTab('users')}>
                  👤 Create Manager / Counsellor Account
                </button>
                <button className="btn btn-sm btn-success" onClick={() => onNavigateTab('commissions')}>
                  🏦 Global Commission Payout Ledger
                </button>
              </div>
            </div>
          </div>

          {/* Admin KPI Stats */}
          <div className="stats-grid">
            <div className="stat-card blue">
              <div className="stat-card-top">
                <span className="stat-label">Total Company Enquiries</span>
                <div className="stat-icon">📥</div>
              </div>
              <div className="stat-value">{kpiStats.totalLeads ?? 1250}</div>
              <div className="stat-trend up">
                <span>↑</span> +18.4% this session
              </div>
            </div>

            <div className="stat-card purple">
              <div className="stat-card-top">
                <span className="stat-label">Active Managers</span>
                <div className="stat-icon">👔</div>
              </div>
              <div className="stat-value">10 Teams</div>
              <div className="stat-trend">e.g. Priya Manager Team</div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Total Confirmed Admissions</span>
                <div className="stat-icon">🎓</div>
              </div>
              <div className="stat-value">{kpiStats.confirmedAdmissions || 120}</div>
              <div className="stat-trend up">
                <span>↑</span> Uttarakhand Boarding Placements
              </div>
            </div>

            <div className="stat-card amber">
              <div className="stat-card-top">
                <span className="stat-label">Pending Verification Queue</span>
                <div className="stat-icon">⏳</div>
              </div>
              <div className="stat-value">{pendingCount || 15}</div>
              <div className="stat-trend">Needs Manager Review</div>
            </div>

            <div className="stat-card green">
              <div className="stat-card-top">
                <span className="stat-label">Total Organization Commission</span>
                <div className="stat-icon">💰</div>
              </div>
              <div className="stat-value">₹{(totalCommAmount || 1200000).toLocaleString('en-IN')}</div>
              <div className="stat-trend">3-Way Split (Counsellor, Manager, Org)</div>
            </div>
          </div>

          {/* Live Counsellor Activity & Presence Monitoring Wall */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">🟢 Live Employee Presence &amp; Shift Monitor (Admin View)</h3>
                <span className="card-subtitle">
                  Real-time login/logout tracking and active work status across all teams.
                </span>
              </div>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => showToast('Refreshed real-time presence audit logs!')}
              >
                🔄 Refresh Live Status
              </button>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Role</th>
                    <th>Assigned Team / Manager</th>
                    <th>Today Login Time</th>
                    <th>Current Live Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Khushi Sharma (EMP-COU-001)</strong></td>
                    <td><span className="badge badge-info">Counsellor</span></td>
                    <td>Priya Rawat (UK Pioneers)</td>
                    <td>09:30 AM</td>
                    <td>
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%' }}></span>
                        🟢 Active (Calling Parent)
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => setShowReassignModal({ name: 'Khushi Sharma', team: 'Uttarakhand Pioneers' })}
                      >
                        🔄 Reassign Team
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Priya Rawat (EMP-MGR-001)</strong></td>
                    <td><span className="badge badge-purple">Senior Manager</span></td>
                    <td>Team Uttarakhand Pioneers</td>
                    <td>09:15 AM</td>
                    <td>
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%' }}></span>
                        🟢 Active (Reviewing Leads)
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => onNavigateTab('teams')}>
                        👥 Manage Team
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Rahul Sharma (EMP-COU-002)</strong></td>
                    <td><span className="badge badge-info">Counsellor</span></td>
                    <td>Priya Rawat (UK Pioneers)</td>
                    <td>09:40 AM</td>
                    <td>
                      <span className="badge badge-warning">
                        🟡 Idle (5 mins)
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => setShowReassignModal({ name: 'Rahul Sharma', team: 'Uttarakhand Pioneers' })}
                      >
                        🔄 Reassign Team
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS & ACTION DIALOGS                                                   */}
      {/* ========================================================================= */}

      {/* Modal 1: Call & Feedback Form for Counsellor */}
      {selectedLeadForCall && (
        <div className="modal-overlay" onClick={() => setSelectedLeadForCall(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                  📞 Call Parent &amp; Record Feedback
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Student: <strong>{selectedLeadForCall.studentId?.name || selectedLeadForCall.studentName}</strong> ({selectedLeadForCall.studentId?.admissionClass || selectedLeadForCall.applyingForGrade || 'Class 6'})
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setSelectedLeadForCall(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveCallFeedback}>
              <div className="modal-body">
                {/* Dual Contact Picker */}
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #E2E8F0' }}>
                  <label className="form-label">Whom are you calling right now?</label>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="callWhom"
                        checked={callWhom === 'father'}
                        onChange={() => setCallWhom('father')}
                      />
                      <span>👨 Father: <strong>{selectedLeadForCall.fatherPhone || selectedLeadForCall.parentId?.mobile || '+91 98765 43210'}</strong></span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="callWhom"
                        checked={callWhom === 'mother'}
                        onChange={() => setCallWhom('mother')}
                      />
                      <span>👩 Mother: <strong>{selectedLeadForCall.motherPhone || '+91 98765 43211'}</strong></span>
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
                    <option value="Connected & Spoke to Parent">Connected &amp; Spoke to Parent</option>
                    <option value="Ringing / No Answer">Ringing / No Answer (Auto Follow-up +2 hrs)</option>
                    <option value="Switched Off / Not Reachable">Switched Off / Not Reachable</option>
                    <option value="Call Busy / Asked to Call Later">Call Busy / Asked to Call Later</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Is this a Genuine Boarding School Enquiry? <span className="req">*</span></label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${callIntent === 'GENUINE' ? 'btn-success' : 'btn-outline'}`}
                      style={{ flex: 1, padding: '10px' }}
                      onClick={() => setCallIntent('GENUINE')}
                    >
                      🌟 YES – Genuine Boarding Lead
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${callIntent === 'JUNK' ? 'btn-danger' : 'btn-outline'}`}
                      style={{ flex: 1, padding: '10px' }}
                      onClick={() => setCallIntent('JUNK')}
                    >
                      ❌ NO – Junk / Day School / Not Interested
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Detailed Parent Interaction Notes</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Father confirmed willingness to enrol in Mussoorie/Dehradun. Budget ₹8 Lakhs fits well. Agreed for weekend follow-up..."
                    required
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setSelectedLeadForCall(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Save Outcome &amp; Add to Genuine Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Forward Batch of Genuine Leads to Manager */}
      {showForwardModal && (
        <div className="modal-overlay" onClick={() => setShowForwardModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                📤 Forward Genuine Leads to Manager
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowForwardModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13.5px', color: '#334155' }}>
                You have marked <strong>{counsellorGenuineCount} Parents</strong> as Genuine Boarding Candidates. Forwarding will notify <strong>Priya Manager</strong> to inspect the dossier, match boarding schools, and dispatch school brochure templates.
              </p>
              <div style={{ background: '#F0FDF4', padding: '12px', borderRadius: '8px', border: '1px solid #86EFAC' }}>
                <div>✅ <strong>Quality Check:</strong> All 60 leads contain both Father &amp; Mother contact numbers.</div>
                <div>✅ <strong>Target School Match:</strong> The Doon School, Welham, Sherwood, SelaQui.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowForwardModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={handleForwardToManager}>
                Confirm &amp; Send to Priya Manager
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Counsellor Performance & Commission Report */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                📄 Counsellor Performance &amp; Commission Report
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowReportModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Report Period</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${reportPeriod === 'weekly' ? 'btn-navy' : 'btn-outline'}`}
                    onClick={() => setReportPeriod('weekly')}
                  >
                    Weekly Summary
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${reportPeriod === 'monthly' ? 'btn-navy' : 'btn-outline'}`}
                    onClick={() => setReportPeriod('monthly')}
                  >
                    Monthly Summary (Full Session)
                  </button>
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Counsellor Name:</span>
                  <strong>{user?.fullName || 'Khushi Sharma'} (EMP-COU-001)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Assigned Manager:</span>
                  <strong>Priya Rawat (Uttarakhand Pioneers)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Parents Contacted (Spoken With):</span>
                  <strong>{counsellorCallsCount} Parents</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Genuine Leads Forwarded:</span>
                  <strong>{counsellorGenuineCount} Leads</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Confirmed Admissions Closed:</span>
                  <strong style={{ color: '#16A34A' }}>{counsellorAdmissionsCount} Admissions</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #CBD5E1', paddingTop: '8px', fontSize: '14px' }}>
                  <span>Total Commission Earned (@ ₹1,000/adm):</span>
                  <strong style={{ color: '#16A34A', fontSize: '16px' }}>₹{counsellorTotalCommission.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowReportModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={handleSendReport}>
                ✉️ Send Report to Manager &amp; Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Reschedule Campus Visit for Manager */}
      {showRescheduleModal && (
        <div className="modal-overlay" onClick={() => setShowRescheduleModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                📅 Reschedule School Campus Visit
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowRescheduleModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px' }}>
                Parent of <strong>{showRescheduleModal.student}</strong> (Counsellor: {showRescheduleModal.counsellor}) missed the previous visit. Select new rescheduled visit date:
              </p>
              <div className="form-group">
                <label className="form-label">New Campus Visit Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={newVisitDate}
                  onChange={(e) => setNewVisitDate(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowRescheduleModal(null)}>Cancel</button>
              <button
                className="btn btn-warning"
                onClick={() => {
                  showToast(`Campus visit for ${showRescheduleModal.student} rescheduled to ${newVisitDate}! Dashboard updated.`, 'success');
                  setShowRescheduleModal(null);
                }}
              >
                Confirm Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Send Brochure Template for Manager */}
      {showBrochureModal && (
        <div className="modal-overlay" onClick={() => setShowBrochureModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                📱 Dispatch Budget-Matched School Template
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowBrochureModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px' }}>
                Dispatch official prospectus and fee structure for <strong>{showBrochureModal.name}</strong> to Father &amp; Mother contact numbers via WhatsApp Business API:
              </p>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px' }}>
                <p style={{ margin: 0 }}>
                  &quot;Namaste! Greetings from Uttarakhand Boarding Admission Cell. Sharing official 2026-27 Prospectus, Pastoral Care &amp; Fee Schedule for {showBrochureModal.name}. Campus tour scheduled.&quot;
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowBrochureModal(null)}>Cancel</button>
              <button
                className="btn btn-success"
                onClick={() => {
                  showToast(`Official template dispatched to parent via WhatsApp!`, 'success');
                  setShowBrochureModal(null);
                }}
              >
                Send via WhatsApp &amp; Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 6: Reassign Team for Admin */}
      {showReassignModal && (
        <div className="modal-overlay" onClick={() => setShowReassignModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                🔄 Reassign Counsellor to New Manager Team
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowReassignModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px' }}>
                Reassign <strong>{showReassignModal.name}</strong> to a different Manager team:
              </p>
              <div className="form-group">
                <label className="form-label">Target Manager Team</label>
                <select
                  className="form-control"
                  value={targetTeam}
                  onChange={(e) => setTargetTeam(e.target.value)}
                >
                  <option value="Team Uttarakhand Pioneers (Priya Manager)">Team Uttarakhand Pioneers (Priya Manager)</option>
                  <option value="Team Mussoorie Royals (Vikram Manager)">Team Mussoorie Royals (Vikram Manager)</option>
                  <option value="Team Nainital Scholars (Ramesh Manager)">Team Nainital Scholars (Ramesh Manager)</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowReassignModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  showToast(`${showReassignModal.name} successfully reassigned to ${targetTeam}!`, 'success');
                  setShowReassignModal(null);
                }}
              >
                Confirm Reassignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
