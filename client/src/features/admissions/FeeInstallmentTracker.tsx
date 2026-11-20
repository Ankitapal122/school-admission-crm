import React, { useMemo, useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall, getApiBase } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

interface InstallmentItem {
  id: string;
  admissionId: string;
  installmentNumber: number;
  title: string;
  percentage: number;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'PENDING_VERIFICATION';
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
  const { accessToken, user, previewRole } = useAuthStore();
  const effectiveRoleStr = String(previewRole || user?.role || '').toLowerCase();
  const canVerifyPayment =
    effectiveRoleStr.includes('admin') || effectiveRoleStr.includes('manager');

  const handleVerifyInstallment = async (admissionId: string, instId: string, studentName: string) => {
    try {
      await apiCall(`/applications/${admissionId}/installments/${instId}/verify`, 'POST', {});
      onShowToast(`Payment verified & approved for ${studentName}! Receipt PDF unlocked.`, 'success');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Verification failed.', 'danger');
    }
  };

  // View tab: Student cards vs Complete Real Payment Ledger
  const [viewMode, setViewMode] = useState<'students' | 'ledger'>('students');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');

  // Pay Existing Milestone Modal State
  const [selectedInstallment, setSelectedInstallment] = useState<{
    admission: any;
    installment: InstallmentItem;
  } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payUtr, setPayUtr] = useState('');
  const [payMode, setPayMode] = useState('NEFT / RTGS / IMPS');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  // Add / Pay Custom Installment Modal State
  const [customAdm, setCustomAdm] = useState<any | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customStatus, setCustomStatus] = useState<'PAID' | 'PENDING'>('PAID');
  const [customMode, setCustomMode] = useState('UPI / QR');
  const [customUtr, setCustomUtr] = useState('');
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [customNotes, setCustomNotes] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);

  // Setup 3-Tier Plan Modal State
  const [settingUpAdm, setSettingUpAdm] = useState<any | null>(null);
  const [setupFee, setSetupFee] = useState('450000');
  const [settingUp, setSettingUp] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAdmissions = useMemo(() => {
    return admissions.filter((a) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const sName = String(a.studentName || a.lead?.studentName || '').toLowerCase();
      const schName = String(a.schoolName || a.school?.name || '').toLowerCase();
      const code = String(a.admissionNumber || a.applicationCode || '').toLowerCase();
      const mgr = String(a.assignedManager?.fullName || a.manager?.fullName || '').toLowerCase();
      const cou = String(a.assignedCounsellor?.fullName || a.counsellor?.fullName || '').toLowerCase();
      return sName.includes(q) || schName.includes(q) || code.includes(q) || mgr.includes(q) || cou.includes(q);
    });
  }, [admissions, searchQuery]);

  // Flatten all installment payment records across admissions for Real Payment Ledger
  const allLedgerRows = useMemo(() => {
    const rows: Array<{
      inst: InstallmentItem;
      admission: any;
      studentName: string;
      parentName: string;
      schoolName: string;
      appNumber: string;
      managerName: string;
      counsellorName: string;
    }> = [];

    filteredAdmissions.forEach((adm) => {
      const insts: InstallmentItem[] = adm.installments || [];
      insts.forEach((inst) => {
        if (ledgerStatusFilter === 'PAID' && inst.status !== 'PAID') return;
        if (ledgerStatusFilter === 'PENDING' && inst.status === 'PAID') return;
        rows.push({
          inst,
          admission: adm,
          studentName: adm.studentName || adm.lead?.studentName || 'Student',
          parentName: adm.parentName || adm.lead?.parentName || 'Parent',
          schoolName: adm.schoolName || adm.school?.name || 'School',
          appNumber: adm.admissionNumber || adm.appId || 'APP',
          managerName: adm.assignedManager?.fullName || adm.manager?.fullName || '—',
          counsellorName: adm.assignedCounsellor?.fullName || adm.counsellor?.fullName || '—',
        });
      });
    });

    return rows.sort((a, b) => {
      const tA = new Date(a.inst.paidAt || a.inst.dueDate || 0).getTime();
      const tB = new Date(b.inst.paidAt || b.inst.dueDate || 0).getTime();
      return tB - tA;
    });
  }, [filteredAdmissions, ledgerStatusFilter]);

  // High-level financial stats
  let totalAgreed = 0;
  let totalCollected = 0;
  let totalPaidCount = 0;
  let totalPendingCount = 0;
  filteredAdmissions.forEach((a) => {
    const fee = Number(a.feeAgreed || a.confirmedRevenue || 0);
    totalAgreed += fee;
    const insts: InstallmentItem[] = a.installments || [];
    insts.forEach((ins) => {
      if (ins.status === 'PAID') {
        totalCollected += Number(ins.amount || 0);
        totalPaidCount += 1;
      } else {
        totalPendingCount += 1;
      }
    });
  });
  const totalPending = Math.max(0, totalAgreed - totalCollected);

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallment) return;
    setPaying(true);
    try {
      const { admission, installment } = selectedInstallment;
      const numericAmount = Number(payAmount || installment.amount);
      await apiCall(
        `/applications/${admission.id}/installments/${installment.id}/pay`,
        'POST',
        {
          amount: numericAmount,
          utrNumber: payUtr.trim() || `UTR-${Date.now().toString().slice(-8)}`,
          paymentMode: payMode,
          paidAt: new Date(payDate).toISOString(),
          notes: payNotes.trim(),
        }
      );
      onShowToast(
        `Fee payment of ₹${numericAmount.toLocaleString('en-IN')} recorded & saved in permanent ledger!`,
        'success'
      );
      setSelectedInstallment(null);
      setPayAmount('');
      setPayUtr('');
      setPayNotes('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to record installment payment.', 'danger');
    } finally {
      setPaying(false);
    }
  };

  const handleCustomInstallmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAdm) return;
    const amt = Number(customAmount || 0);
    if (!amt || amt <= 0) {
      onShowToast('Please enter a valid payment amount.', 'warning');
      return;
    }
    setSavingCustom(true);
    try {
      await apiCall(`/applications/${customAdm.id}/installments/add-payment`, 'POST', {
        title: customTitle.trim() || 'Fee Installment',
        amount: amt,
        status: customStatus,
        paymentMode: customMode,
        utrNumber: customUtr.trim(),
        paidAt: new Date(customDate).toISOString(),
        dueDate: new Date(customDate).toISOString(),
        notes: customNotes.trim(),
      });
      onShowToast(
        customStatus === 'PAID'
          ? `Payment of ₹${amt.toLocaleString('en-IN')} saved in real payment record!`
          : `Installment milestone of ₹${amt.toLocaleString('en-IN')} scheduled cleanly!`,
        'success'
      );
      setCustomAdm(null);
      setCustomTitle('');
      setCustomAmount('');
      setCustomUtr('');
      setCustomNotes('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to save installment record.', 'danger');
    } finally {
      setSavingCustom(false);
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

  const handleDownloadReceipt = async (adm: any) => {
    try {
      const token = accessToken || localStorage.getItem('crm_token') || '';
      const res = await fetch(`${getApiBase()}/applications/${adm.id}/receipt-pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Receipt generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BoardingEdu_Receipt_${adm.admissionNumber || adm.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onShowToast('Fee Receipt downloaded!', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Could not download receipt PDF.', 'danger');
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Status',
      'App Number',
      'Student Name',
      'Parent Name',
      'School Name',
      'Manager',
      'Counsellor',
      'Installment Title',
      'Amount (INR)',
      'Payment Mode',
      'UTR / Reference',
      'Notes',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvLines = [
      headers.join(','),
      ...allLedgerRows.map((r) =>
        [
          r.inst.paidAt
            ? new Date(r.inst.paidAt).toLocaleString('en-IN')
            : new Date(r.inst.dueDate).toLocaleDateString('en-IN'),
          r.inst.status,
          r.appNumber,
          r.studentName,
          r.parentName,
          r.schoolName,
          r.managerName,
          r.counsellorName,
          r.inst.title,
          r.inst.amount,
          r.inst.paymentMode || '',
          r.inst.utrNumber || '',
          r.inst.notes || '',
        ]
          .map(esc)
          .join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BoardingEdu_Fee_Installments_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onShowToast('Fee Payment Ledger CSV exported!', 'success');
  };

  return (
    <div>
      {/* Top summary strip */}
      <div className="stats-grid" style={{ marginBottom: '18px' }}>
        <div className="stat-card blue">
          <div className="stat-card-top">
            <span className="stat-label">Total Agreed Fees</span>
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
            {totalPaidCount} Paid Record(s) •{' '}
            {totalAgreed > 0 ? `${Math.round((totalCollected / totalAgreed) * 100)}%` : '0%'}
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-card-top">
            <span className="stat-label">Pending Balance</span>
            <div className="stat-icon"><CrmIcon name="clock" size={16} /></div>
          </div>
          <div className="stat-value">₹{totalPending.toLocaleString('en-IN')}</div>
          <div className="stat-trend">{totalPendingCount} Pending Installment(s)</div>
        </div>
      </div>

      {/* Controls & View Switcher */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'students' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setViewMode('students')}
          >
            <CrmIcon name="graduation-cap" size={14} /> By Student ({filteredAdmissions.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'ledger' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setViewMode('ledger')}
          >
            <CrmIcon name="file-text" size={14} /> All Payment Records ({totalPaidCount + totalPendingCount})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 260px', justifyContent: 'flex-end' }}>
          <input
            type="text"
            className="form-control"
            style={{ maxWidth: '300px', minWidth: '200px' }}
            placeholder="Search student, school, manager, app #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="button" className="btn btn-sm btn-outline" onClick={handleExportCsv}>
            <CrmIcon name="download" size={14} /> Export CSV
          </button>
          <button type="button" className="btn btn-sm btn-outline" onClick={onRefresh}>
            <CrmIcon name="refresh-cw" size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* VIEW 1: STUDENT CARDS WITH INSTALLMENT MILESTONES */}
      {viewMode === 'students' && (
        filteredAdmissions.length === 0 ? (
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
            No student admissions found matching your search.
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
              const balanceRemaining = Math.max(0, fee - paidAmount);
              const pctPaid = fee > 0 ? Math.min(100, Math.round((paidAmount / fee) * 100)) : 0;
              const mgrName = adm.assignedManager?.fullName || adm.manager?.fullName || '—';
              const couName = adm.assignedCounsellor?.fullName || adm.counsellor?.fullName || '—';

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
                  {/* Header: Student, School, Hierarchy, Fee & Actions */}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                          {adm.admissionClass || 'Class 6'}
                        </span>
                        {pctPaid === 100 && (
                          <span
                            style={{
                              background: '#DCFCE7',
                              color: '#15803D',
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            ✓ 100% Fee Paid
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
                        🏫 <strong>{adm.schoolName || adm.school?.name || 'School'}</strong> &bull; Parent:{' '}
                        {adm.parentName || adm.lead?.parentName || 'Parent'} ({adm.lead?.parentPhone || 'N/A'})
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px', fontSize: '11.5px' }}>
                        <span style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: '6px', color: '#334155', fontWeight: 600 }}>
                          Manager: <strong>{mgrName}</strong>
                        </span>
                        <span style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: '6px', color: '#334155', fontWeight: 600 }}>
                          Counsellor: <strong>{couName}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Fee summary & Action Buttons */}
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                        Total Fee: ₹{fee.toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#16A34A' }}>Paid: ₹{paidAmount.toLocaleString('en-IN')} ({pctPaid}%)</span>
                        <span style={{ color: balanceRemaining > 0 ? '#D97706' : '#64748B' }}>
                          Balance: ₹{balanceRemaining.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-success"
                          onClick={() => {
                            const nextNum = installments.length + 1;
                            setCustomAdm(adm);
                            setCustomTitle(`Installment ${nextNum}`);
                            setCustomAmount(String(balanceRemaining > 0 ? balanceRemaining : Math.round(fee * 0.25)));
                            setCustomStatus('PAID');
                            setCustomMode('UPI / QR');
                            setCustomUtr('');
                            setCustomDate(new Date().toISOString().split('T')[0]);
                            setCustomNotes('');
                          }}
                        >
                          <CrmIcon name="plus" size={14} /> Add / Pay Installment
                        </button>
                        {!hasPlan && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              setSettingUpAdm(adm);
                              setSetupFee(String(fee));
                            }}
                          >
                            ⚡ 3-Tier Plan
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => handleDownloadReceipt(adm)}
                        >
                          <CrmIcon name="file-text" size={14} /> Receipt PDF
                        </button>
                      </div>
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
                      <span>Installment Collection Progress</span>
                      <span><strong>{pctPaid}%</strong> Completed</span>
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

                  {/* Installment Cards */}
                  {hasPlan ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      {installments.map((ins) => {
                        const isPaid = ins.status === 'PAID';
                        const isPendingVerify = ins.status === 'PENDING_VERIFICATION';
                        return (
                          <div
                            key={ins.id}
                            style={{
                              background: isPaid ? '#F0FDF4' : isPendingVerify ? '#EFF6FF' : '#F8FAFC',
                              border: isPaid ? '1px solid #BBF7D0' : isPendingVerify ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
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
                                gap: '6px',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  color: isPaid ? '#166534' : isPendingVerify ? '#1E3A8A' : '#1E293B',
                                }}
                              >
                                #{ins.installmentNumber}: {ins.title} {ins.percentage ? `(${ins.percentage}%)` : ''}
                              </span>
                              <span
                                style={{
                                  background: isPaid ? '#DCFCE7' : isPendingVerify ? '#DBEAFE' : '#FEF3C7',
                                  color: isPaid ? '#15803D' : isPendingVerify ? '#1D4ED8' : '#B45309',
                                  fontSize: '10.5px',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  flexShrink: 0,
                                }}
                              >
                                {isPaid ? 'PAID (VERIFIED)' : isPendingVerify ? 'AWAITING VERIFICATION' : 'PENDING'}
                              </span>
                            </div>

                            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                              ₹{Number(ins.amount || 0).toLocaleString('en-IN')}
                            </div>

                            <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                              Due Date: <strong>{new Date(ins.dueDate).toLocaleDateString('en-IN')}</strong>
                            </div>

                            {isPendingVerify && (
                              <div
                                style={{
                                  background: '#FFFFFF',
                                  border: '1px solid #BFDBFE',
                                  borderRadius: '6px',
                                  padding: '8px',
                                  fontSize: '11px',
                                  color: '#1E3A8A',
                                  lineHeight: 1.5,
                                }}
                              >
                                <div>UTR / Ref: <strong>{ins.utrNumber || 'Submitted'}</strong></div>
                                <div>Mode: <strong>{ins.paymentMode || 'Bank Transfer'}</strong></div>
                                <div style={{ color: '#475569', marginTop: '2px' }}>
                                  Submitted by Counsellor — requires Manager/Admin verification.
                                </div>
                                {canVerifyPayment && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    style={{ marginTop: '8px', width: '100%' }}
                                    onClick={() => handleVerifyInstallment(adm.id, ins.id, adm.studentName)}
                                  >
                                    Verify &amp; Approve Payment
                                  </button>
                                )}
                              </div>
                            )}

                            {isPaid ? (
                              <div
                                style={{
                                  background: '#FFFFFF',
                                  border: '1px solid #DCFCE7',
                                  borderRadius: '6px',
                                  padding: '8px',
                                  fontSize: '11px',
                                  color: '#166534',
                                  lineHeight: 1.5,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>UTR / Ref: <strong>{ins.utrNumber || 'N/A'}</strong></span>
                                  {canVerifyPayment && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline"
                                      style={{ padding: '2px 7px', fontSize: '10.5px' }}
                                      onClick={() => {
                                        setSelectedInstallment({ admission: adm, installment: ins });
                                        setPayAmount(String(ins.amount || ''));
                                        setPayUtr(ins.utrNumber || '');
                                        setPayMode(ins.paymentMode || 'NEFT / RTGS / IMPS');
                                        setPayDate(
                                          ins.paidAt
                                            ? new Date(ins.paidAt).toISOString().split('T')[0]
                                            : new Date().toISOString().split('T')[0]
                                        );
                                        setPayNotes(ins.notes || '');
                                      }}
                                    >
                                      <CrmIcon name="edit" size={11} /> Edit
                                    </button>
                                  )}
                                </div>
                                <div>Mode: <strong>{ins.paymentMode || 'Bank Transfer'}</strong></div>
                                <div>
                                  Paid On:{' '}
                                  <strong>
                                    {ins.paidAt
                                      ? new Date(ins.paidAt).toLocaleString('en-IN', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          hour12: true,
                                        })
                                      : 'Confirmed'}
                                  </strong>
                                </div>
                                {ins.notes && (
                                  <div style={{ color: '#475569', marginTop: '3px', borderTop: '1px dashed #DCFCE7', paddingTop: '3px' }}>
                                    {ins.notes}
                                  </div>
                                )}
                              </div>
                            ) : !isPendingVerify ? (
                              <button
                                type="button"
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
                                  setPayAmount(String(ins.amount || ''));
                                  setPayUtr('');
                                  setPayDate(new Date().toISOString().split('T')[0]);
                                  setPayNotes('');
                                }}
                              >
                                <CrmIcon name="check-circle" size={14} /> Record Payment (UTR)
                              </button>
                            ) : null}
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
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <span>
                        ⚠️ No installments recorded yet. Generate a 3-Tier schedule or click <strong>Add / Pay Installment</strong> to record a real payment directly.
                      </span>
                      <button
                        type="button"
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
        )
      )}

      {/* VIEW 2: COMPLETE REAL PAYMENT LEDGER TABLE */}
      {viewMode === 'ledger' && (
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                Complete Fee Installment Payment Register (Real DB Records)
              </h4>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                Every recorded installment payment with date, UTR, mode, student, manager &amp; counsellor hierarchy
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['ALL', 'PAID', 'PENDING'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`btn btn-sm ${ledgerStatusFilter === st ? 'btn-navy' : 'btn-outline'}`}
                  onClick={() => setLedgerStatusFilter(st)}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Student &amp; App #</th>
                  <th>School</th>
                  <th>Manager / Counsellor</th>
                  <th>Installment</th>
                  <th>Amount</th>
                  <th>Mode &amp; UTR / Ref</th>
                  <th>Status</th>
                  <th>Action / Notes</th>
                </tr>
              </thead>
              <tbody>
                {allLedgerRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                      No fee installment records found for this filter.
                    </td>
                  </tr>
                ) : (
                  allLedgerRows.map((row) => {
                    const isPaid = row.inst.status === 'PAID';
                    return (
                      <tr key={row.inst.id}>
                        <td style={{ fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                          {isPaid && row.inst.paidAt ? (
                            <div>
                              <strong style={{ color: '#0F172A' }}>
                                {new Date(row.inst.paidAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </strong>
                              <div style={{ color: '#64748B', fontSize: '10.5px' }}>
                                {new Date(row.inst.paidAt).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span style={{ color: '#B45309', fontWeight: 600 }}>
                                Due: {new Date(row.inst.dueDate).toLocaleDateString('en-IN')}
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          <strong>{row.studentName}</strong>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {row.appNumber} &bull; {row.parentName}
                          </div>
                        </td>
                        <td style={{ fontSize: '12px', fontWeight: 600 }}>{row.schoolName}</td>
                        <td style={{ fontSize: '11.5px' }}>
                          <div><strong>Mgr:</strong> {row.managerName}</div>
                          <div style={{ color: '#64748B' }}><strong>Cou:</strong> {row.counsellorName}</div>
                        </td>
                        <td style={{ fontSize: '12px', fontWeight: 600 }}>
                          #{row.inst.installmentNumber} {row.inst.title}
                        </td>
                        <td style={{ fontSize: '13px', fontWeight: 800, color: isPaid ? '#15803D' : '#0F172A', whiteSpace: 'nowrap' }}>
                          ₹{Number(row.inst.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ fontSize: '11.5px' }}>
                          {isPaid ? (
                            <>
                              <div><strong>{row.inst.paymentMode || 'Bank Transfer'}</strong></div>
                              <div style={{ color: '#475569', fontFamily: 'monospace', fontSize: '11px' }}>
                                {row.inst.utrNumber || '—'}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>Awaiting Payment</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${isPaid ? 'badge-success' : 'badge-warning'}`}
                            style={{ fontWeight: 800 }}
                          >
                            {isPaid ? '● PAID' : '● PENDING'}
                          </span>
                        </td>
                        <td style={{ fontSize: '11px', maxWidth: '200px' }}>
                          {isPaid ? (
                            <div style={{ color: '#475569' }}>{row.inst.notes || 'Verified'}</div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              onClick={() => {
                                setSelectedInstallment({ admission: row.admission, installment: row.inst });
                                setPayAmount(String(row.inst.amount || ''));
                                setPayUtr('');
                                setPayDate(new Date().toISOString().split('T')[0]);
                                setPayNotes('');
                              }}
                            >
                              Pay Now
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: RECORD PAYMENT FOR EXISTING PENDING INSTALLMENT */}
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
                  {selectedInstallment.installment.title} for <strong>{selectedInstallment.admission.studentName}</strong>
                </span>
              </div>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setSelectedInstallment(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handlePaySubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Amount Paid (₹) *</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    min={1}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Bank Transaction / UTR / Receipt Reference *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. UTR202611199988 or UPI Ref #"
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
                    <option value="Cash">Cash Receipt</option>
                    <option value="Credit / Debit Card">Credit / Debit Card</option>
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
                  <label className="form-label">Payment Notes / Remarks</label>
                  <textarea
                    rows={2}
                    className="form-control"
                    placeholder="Paid by parent in school account, receipt verified..."
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
                  {paying ? 'Saving...' : 'Confirm Payment & Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / PAY CUSTOM INSTALLMENT DIRECTLY */}
      {customAdm && (
        <div className="modal-overlay" onClick={() => setCustomAdm(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '500px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  <CrmIcon name="plus-circle" size={16} /> Add / Pay Fee Installment
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Student: <strong>{customAdm.studentName || customAdm.lead?.studentName}</strong> ({customAdm.schoolName || customAdm.school?.name})
                </span>
              </div>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setCustomAdm(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleCustomInstallmentSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Quick Mode Selector: Full Fee vs Installment Plan */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${customTitle.toLowerCase().includes('full') ? 'btn-success' : 'btn-outline'}`}
                    onClick={() => {
                      const totalFee = Number(customAdm.feeAgreed || customAdm.confirmedRevenue || 450000);
                      const alreadyPaid = (customAdm.installments || [])
                        .filter((i: any) => i.status === 'PAID')
                        .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
                      const remaining = Math.max(totalFee - alreadyPaid, totalFee);
                      setCustomTitle('Full Admission Fee (100%)');
                      setCustomAmount(String(remaining));
                      setCustomStatus('PAID');
                    }}
                  >
                    <CrmIcon name="check-circle" size={14} /> Full Fee Paid (100%)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${!customTitle.toLowerCase().includes('full') ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      const nextNum = (customAdm.installments || []).length + 1;
                      const totalFee = Number(customAdm.feeAgreed || customAdm.confirmedRevenue || 450000);
                      setCustomTitle(`Installment ${nextNum}`);
                      setCustomAmount(String(Math.round(totalFee / 3)));
                    }}
                  >
                    <CrmIcon name="calendar" size={14} /> Pay in Installments
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Installment Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. 1st Installment / Token Fee"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Amount (₹) *</label>
                    <input
                      type="number"
                      className="form-control"
                      required
                      min={1}
                      placeholder="e.g. 150000"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Record As *</label>
                    <select
                      className="form-control"
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value as 'PAID' | 'PENDING')}
                    >
                      <option value="PAID">Paid Now (Save Payment)</option>
                      <option value="PENDING">Pending (Schedule Due Date)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{customStatus === 'PAID' ? 'Payment Date *' : 'Due Date *'}</label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                    />
                  </div>
                </div>

                {customStatus === 'PAID' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label">Payment Mode *</label>
                      <select
                        className="form-control"
                        value={customMode}
                        onChange={(e) => setCustomMode(e.target.value)}
                      >
                        <option value="UPI / QR">UPI / QR</option>
                        <option value="NEFT / RTGS / IMPS">NEFT / RTGS / IMPS</option>
                        <option value="Net Banking">Net Banking</option>
                        <option value="Cheque / DD">Cheque / Demand Draft</option>
                        <option value="Cash">Cash Receipt</option>
                        <option value="Credit / Debit Card">Credit / Debit Card</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">UTR / Receipt Ref # *</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. UTR987654321"
                        value={customUtr}
                        onChange={(e) => setCustomUtr(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Notes / Remarks</label>
                  <textarea
                    rows={2}
                    className="form-control"
                    placeholder="Paid directly by parent / verified slip uploaded..."
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setCustomAdm(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={savingCustom} className="btn btn-success">
                  {savingCustom ? 'Saving...' : customStatus === 'PAID' ? 'Save Paid Installment' : 'Schedule Installment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SETUP 3-TIER PLAN */}
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
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setSettingUpAdm(null)}>
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
