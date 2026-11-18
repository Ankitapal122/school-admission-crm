import React, { useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

interface InstallmentItem {
  id: string;
  admissionId: string;
  installmentNumber: number;
  title: string;
  percentage: number;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID';
  paidAt?: string | null;
  utrNumber?: string | null;
  paymentMode?: string | null;
  notes?: string | null;
}

export function FeeInstallmentTracker({
  admissions = [],
  onRefresh,
  onShowToast,
}: {
  admissions: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const rawRole = String(user?.role || '').toLowerCase();
  const isManagerOrAdmin = ['super_admin', 'manager', 'senior_manager'].includes(rawRole);

  // Pay Modal State
  const [selectedInstallment, setSelectedInstallment] = useState<{
    admission: any;
    installment: InstallmentItem;
  } | null>(null);
  const [payUtr, setPayUtr] = useState('');
  const [payMode, setPayMode] = useState('NEFT / RTGS / IMPS');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  // Setup Plan Modal State
  const [settingUpAdm, setSettingUpAdm] = useState<any | null>(null);
  const [setupFee, setSetupFee] = useState('450000');
  const [settingUp, setSettingUp] = useState(false);

  // Filter
  const [searchQuery, setSearchQuery] = useState('');

  if (!isManagerOrAdmin) {
    return (
      <div
        style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: '12px',
          padding: '36px 24px',
          textAlign: 'center',
          color: '#92400E',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
        <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: '#78350F' }}>
          Restricted Access - Managers &amp; Admins Only
        </h3>
        <p style={{ fontSize: '13.5px', maxWidth: '500px', margin: '0 auto', lineHeight: 1.5 }}>
          3-Tier Milestone Fee Installments and collection ledgers are strictly confidential. Counsellors can view student admissions and application progress, but payment collection milestones are managed by Senior Managers and Super Admins.
        </p>
      </div>
    );
  }

  // Filter admissions
  const filteredAdmissions = admissions.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const sName = String(a.studentName || a.lead?.studentName || '').toLowerCase();
    const schName = String(a.schoolName || a.school?.name || '').toLowerCase();
    const code = String(a.admissionNumber || a.applicationCode || '').toLowerCase();
    return sName.includes(q) || schName.includes(q) || code.includes(q);
  });

  // Calculate high-level stats
  let totalAgreed = 0;
  let totalCollected = 0;
  filteredAdmissions.forEach((a) => {
    const fee = Number(a.feeAgreed || a.confirmedRevenue || 0);
    totalAgreed += fee;
    const insts: InstallmentItem[] = a.installments || [];
    insts.forEach((ins) => {
      if (ins.status === 'PAID') totalCollected += Number(ins.amount || 0);
    });
  });
  const totalPending = Math.max(0, totalAgreed - totalCollected);

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallment) return;
    setPaying(true);
    try {
      const { admission, installment } = selectedInstallment;
      await apiCall(
        `/applications/${admission.id}/installments/${installment.id}/pay`,
        'POST',
        {
          utrNumber: payUtr.trim() || `UTR-${Date.now().toString().slice(-6)}`,
          paymentMode: payMode,
          paidAt: new Date(payDate).toISOString(),
          notes: payNotes.trim(),
        }
      );
      onShowToast(
        `Payment of ₹${installment.amount.toLocaleString('en-IN')} marked as PAID! UTR recorded.`,
        'success'
      );
      setSelectedInstallment(null);
      setPayUtr('');
      setPayNotes('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to record installment payment.', 'danger');
    } finally {
      setPaying(false);
    }
  };

  const handleSetupPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingUpAdm) return;
    setSettingUp(true);
    try {
      await apiCall(`/applications/${settingUpAdm.id}/installments/setup-plan`, 'POST', {
        totalFee: Number(setupFee || 450000),
      });
      onShowToast('3-Tier Fee Milestone Installment plan generated successfully!', 'success');
      setSettingUpAdm(null);
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to generate installment plan.', 'danger');
    } finally {
      setSettingUp(false);
    }
  };

  return (
    <div>
      {/* Top summary strip */}
      <div className="stats-grid" style={{ marginBottom: '18px' }}>
        <div className="stat-card blue">
          <div className="stat-card-top">
            <span className="stat-label">Total Agreed Revenue</span>
            <div className="stat-icon"><CrmIcon name="rupee" size={16} /></div>
          </div>
          <div className="stat-value">₹{totalAgreed.toLocaleString('en-IN')}</div>
          <div className="stat-trend">{filteredAdmissions.length} Enrolled Students</div>
        </div>

        <div className="stat-card green">
          <div className="stat-card-top">
            <span className="stat-label">Total Collected (Paid)</span>
            <div className="stat-icon"><CrmIcon name="check-circle" size={16} /></div>
          </div>
          <div className="stat-value">₹{totalCollected.toLocaleString('en-IN')}</div>
          <div className="stat-trend">
            {totalAgreed > 0 ? `${Math.round((totalCollected / totalAgreed) * 100)}% Collected` : '0%'}
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-card-top">
            <span className="stat-label">Pending Milestones</span>
            <div className="stat-icon"><CrmIcon name="clock" size={16} /></div>
          </div>
          <div className="stat-value">₹{totalPending.toLocaleString('en-IN')}</div>
          <div className="stat-trend">Tracked across 3 Milestone Tiers</div>
        </div>
      </div>

      {/* Filter and explanation bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ flex: '1', minWidth: '260px', maxWidth: '400px' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search by student, school or app code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="btn btn-sm btn-outline" onClick={onRefresh}>
          <CrmIcon name="refresh-cw" size={14} /> Refresh Ledger
        </button>
      </div>

      {/* Admissions List with 3-Tier Installment Cards */}
      {filteredAdmissions.length === 0 ? (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px dashed #CBD5E1',
            padding: '36px 20px',
            textAlign: 'center',
            color: '#64748B',
          }}
        >
          No admissions found matching search.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {filteredAdmissions.map((adm) => {
            const fee = Number(adm.feeAgreed || adm.confirmedRevenue || 450000);
            const installments: InstallmentItem[] = adm.installments || [];
            const hasPlan = installments.length > 0;
            const paidAmount = installments
              .filter((i) => i.status === 'PAID')
              .reduce((s, i) => s + Number(i.amount || 0), 0);
            const pctPaid = fee > 0 ? Math.min(100, Math.round((paidAmount / fee) * 100)) : 0;

            return (
              <div
                key={adm.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Header: Student, School, Fee & Progress */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '12px',
                    borderBottom: '1px solid #F1F5F9',
                    paddingBottom: '14px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                        {adm.studentName || adm.lead?.studentName || 'Student'}
                      </h4>
                      <span
                        style={{
                          background: '#EFF6FF',
                          color: '#1D4ED8',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {adm.admissionNumber || adm.applicationCode || 'APP'}
                      </span>
                      <span
                        style={{
                          background: '#F1F5F9',
                          color: '#475569',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        Class: {adm.admissionClass || '6'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748B', marginTop: '3px' }}>
                      🏫 <strong>{adm.schoolName || adm.school?.name || 'School'}</strong> | Parent: {adm.parentName || adm.lead?.parentName || 'Parent'} ({adm.lead?.parentPhone || 'N/A'})
                    </div>
                  </div>

                  {/* Fee summary & Setup button */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                      Total Fee: ₹{fee.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#16A34A' }}>
                      Paid: ₹{paidAmount.toLocaleString('en-IN')} ({pctPaid}%)
                    </div>
                    {!hasPlan && (
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ marginTop: '6px' }}
                        onClick={() => {
                          setSettingUpAdm(adm);
                          setSetupFee(String(fee));
                        }}
                      >
                        ⚡ Generate 3-Tier Plan
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: '#64748B',
                      marginBottom: '4px',
                    }}
                  >
                    <span>Milestone Payment Progress</span>
                    <span>{pctPaid}% Completed</span>
                  </div>
                  <div
                    style={{
                      height: '8px',
                      background: '#F1F5F9',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pctPaid}%`,
                        background: pctPaid === 100 ? '#16A34A' : '#2563EB',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {/* 3-Tier Installment Cards */}
                {hasPlan ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    {installments.map((ins) => {
                      const isPaid = ins.status === 'PAID';
                      return (
                        <div
                          key={ins.id}
                          style={{
                            background: isPaid ? '#F0FDF4' : '#F8FAFC',
                            border: isPaid ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                            borderRadius: '10px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 800,
                                color: isPaid ? '#166534' : '#1E293B',
                              }}
                            >
                              Tier {ins.installmentNumber}: {ins.title} ({ins.percentage}%)
                            </span>
                            <span
                              style={{
                                background: isPaid ? '#DCFCE7' : '#FEF3C7',
                                color: isPaid ? '#15803D' : '#B45309',
                                fontSize: '10.5px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              {isPaid ? 'PAID' : 'PENDING'}
                            </span>
                          </div>

                          <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                            ₹{Number(ins.amount || 0).toLocaleString('en-IN')}
                          </div>

                          <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                            Due Date: <strong>{new Date(ins.dueDate).toLocaleDateString('en-IN')}</strong>
                          </div>

                          {isPaid ? (
                            <div
                              style={{
                                background: '#FFFFFF',
                                border: '1px solid #DCFCE7',
                                borderRadius: '6px',
                                padding: '8px',
                                fontSize: '11px',
                                color: '#166534',
                              }}
                            >
                              <div>UTR: <strong>{ins.utrNumber || 'N/A'}</strong></div>
                              <div>Mode: {ins.paymentMode || 'Bank Transfer'}</div>
                              <div>Paid On: {ins.paidAt ? new Date(ins.paidAt).toLocaleDateString('en-IN') : 'Confirmed'}</div>
                            </div>
                          ) : (
                            <button
                              className="btn btn-sm btn-success"
                              style={{
                                marginTop: '4px',
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                              }}
                              onClick={() => {
                                setSelectedInstallment({ admission: adm, installment: ins });
                                setPayUtr('');
                                setPayNotes('');
                              }}
                            >
                              <CrmIcon name="check-circle" size={14} /> Record Payment (UTR)
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#92400E',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      ⚠️ 3-Tier Installment schedule not yet initialized for this admission.
                    </span>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        setSettingUpAdm(adm);
                        setSetupFee(String(fee));
                      }}
                    >
                      Setup Schedule (30% / 50% / 20%)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Record Payment Modal */}
      {selectedInstallment && (
        <div className="modal-overlay" onClick={() => setSelectedInstallment(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  <CrmIcon name="rupee" size={16} /> Record Installment Payment
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {selectedInstallment.installment.title} (₹{selectedInstallment.installment.amount.toLocaleString('en-IN')}) for {selectedInstallment.admission.studentName}
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setSelectedInstallment(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handlePaySubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#166534' }}>Installment Amount Due</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#15803D' }}>
                    ₹{selectedInstallment.installment.amount.toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Bank Transaction / UTR Reference *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. UTR1928475923"
                    value={payUtr}
                    onChange={(e) => setPayUtr(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Mode *</label>
                  <select
                    className="form-control"
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value)}
                  >
                    <option value="NEFT / RTGS / IMPS">NEFT / RTGS / IMPS</option>
                    <option value="UPI / QR">UPI / QR</option>
                    <option value="Net Banking">Net Banking</option>
                    <option value="Cheque / DD">Cheque / Demand Draft</option>
                    <option value="Cash Deposit">Cash Deposit at Bank</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Received Date *</label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Accountant / Manager Notes</label>
                  <textarea
                    rows={2}
                    className="form-control"
                    placeholder="Received in HDFC school account, verified by manager..."
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setSelectedInstallment(null)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={paying} className="btn btn-success">
                  {paying ? 'Recording...' : 'Confirm Payment & Update Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Setup Plan Modal */}
      {settingUpAdm && (
        <div className="modal-overlay" onClick={() => setSettingUpAdm(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  <CrmIcon name="calendar" size={16} /> Setup 3-Tier Milestone Schedule
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Student: <strong>{settingUpAdm.studentName}</strong>
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setSettingUpAdm(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleSetupPlanSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Agreed Total Annual Fee (₹) *</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    value={setupFee}
                    onChange={(e) => setSetupFee(e.target.value)}
                  />
                </div>

                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '6px', color: '#0F172A' }}>
                    Standard 3-Tier Milestone Breakdown:
                  </div>
                  <div>• <strong>30% Token / Admission Fee:</strong> ₹{(Number(setupFee || 0) * 0.3).toLocaleString('en-IN')} (Immediate)</div>
                  <div>• <strong>50% 2nd Term Fee:</strong> ₹{(Number(setupFee || 0) * 0.5).toLocaleString('en-IN')} (After 2 Months)</div>
                  <div>• <strong>20% Final Clearance:</strong> ₹{(Number(setupFee || 0) * 0.2).toLocaleString('en-IN')} (Month 4)</div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setSettingUpAdm(null)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={settingUp} className="btn btn-primary">
                  {settingUp ? 'Generating...' : 'Generate 3-Tier Milestones'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
