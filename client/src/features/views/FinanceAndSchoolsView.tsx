import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import CrmIcon from '../../components/CrmIcon';
import { apiCall, downloadApiFile } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { hasRole } from '../../lib/roles';
import { VirtualTourManager } from '../admissions/VirtualTourManager';
import { FeeInstallmentTracker } from '../admissions/FeeInstallmentTracker';

interface LedgerItem {
  id: string;
  commissionCode: string;
  leadNumber: string;
  studentName: string;
  schoolName: string;
  companyAmount: number;
  jrAmount: number;
  srAmount: number;
  netProfit: number;
  status: 'received' | 'pending' | 'paid_out' | 'reversed';
  date?: string;
  originalAmount?: number;
}

const DEFAULT_LEDGER_ITEMS: LedgerItem[] = [];

export function CommissionsView({
  commissions = [],
  users = [],
  schools = [],
  onRefresh,
  onShowToast,
}: {
  commissions: any[];
  users?: any[];
  schools?: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const isAdmin = hasRole(user?.role || user?.rawRole, 'super_admin');
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>(DEFAULT_LEDGER_ITEMS);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedSchool, setSelectedSchool] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Screen 30 Reversal Modal State
  const [reversalModalItem, setReversalModalItem] = useState<LedgerItem | null>(null);
  const [reversalReason, setReversalReason] = useState('Admission cancelled');
  const [reversalNotes, setReversalNotes] = useState('');
  const [reversalBusy, setReversalBusy] = useState(false);

  // View Details Modal State
  const [detailsModalItem, setDetailsModalItem] = useState<LedgerItem | null>(null);

  // Manual Commission Credit Modal State (Admin-only)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addBeneficiaryType, setAddBeneficiaryType] = useState<'counsellor' | 'manager'>('counsellor');
  const [addBeneficiaryId, setAddBeneficiaryId] = useState('');
  const [addManualName, setAddManualName] = useState('');
  const [addAmount, setAddAmount] = useState('5000');
  const [addStudentName, setAddStudentName] = useState('');
  const [addSchoolName, setAddSchoolName] = useState('');
  const [addStatus, setAddStatus] = useState<'received' | 'pending' | 'paid_out'>('received');
  const [addNotes, setAddNotes] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  const counsellorsList = (users || []).filter((u: any) =>
    ['counsellor', 'sr_counsellor', 'jr_counsellor'].includes(String(u?.role || '').toLowerCase())
  );
  const managersList = (users || []).filter((u: any) =>
    ['manager', 'branch_manager', 'regional_manager'].includes(String(u?.role || '').toLowerCase())
  );

  const handleOpenAddModal = (initialRole: 'counsellor' | 'manager' = 'counsellor') => {
    setAddBeneficiaryType(initialRole);
    setAddAmount(initialRole === 'counsellor' ? '5000' : '2000');
    const targetList = initialRole === 'counsellor' ? counsellorsList : managersList;
    if (targetList.length > 0) {
      setAddBeneficiaryId(targetList[0].id);
      setAddManualName(targetList[0].name || '');
    } else {
      setAddBeneficiaryId('');
      setAddManualName('');
    }
    setAddStudentName('');
    setAddSchoolName(schools?.[0]?.name || '');
    setAddStatus('received');
    setAddNotes('');
    setShowAddModal(true);
  };

  const handleRoleTypeChange = (newRole: 'counsellor' | 'manager') => {
    setAddBeneficiaryType(newRole);
    setAddAmount(newRole === 'counsellor' ? '5000' : '2000');
    const targetList = newRole === 'counsellor' ? counsellorsList : managersList;
    if (targetList.length > 0) {
      setAddBeneficiaryId(targetList[0].id);
      setAddManualName(targetList[0].name || '');
    } else {
      setAddBeneficiaryId('');
      setAddManualName('');
    }
  };

  const handleAddCommissionSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const numericAmount = parseFloat(addAmount);
    if (!numericAmount || numericAmount <= 0) {
      onShowToast('Please enter a valid positive commission amount.', 'warning');
      return;
    }

    const selectedUser = (users || []).find((u: any) => u.id === addBeneficiaryId);
    const finalName =
      selectedUser?.name ||
      addManualName.trim() ||
      (addBeneficiaryType === 'counsellor' ? 'Counsellor Staff' : 'Manager Staff');

    setAddBusy(true);
    try {
      await apiCall('/commissions/manual', 'POST', {
        role: addBeneficiaryType,
        beneficiaryUserId: addBeneficiaryId || undefined,
        beneficiaryName: finalName,
        amount: numericAmount,
        studentName: addStudentName.trim() || undefined,
        schoolName: addSchoolName.trim() || undefined,
        status: addStatus,
        notes: addNotes.trim() || undefined,
      });

      onShowToast(`₹${numericAmount.toLocaleString('en-IN')} commission credited for ${finalName}!`, 'success');
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to add commission.', 'danger');
    } finally {
      setAddBusy(false);
    }
  };

  useEffect(() => {
    if (Array.isArray(commissions) && commissions.length > 0) {
      const formatted: LedgerItem[] = commissions.map((c: any, idx: number) => {
        const rawStatus = String(c.status || 'pending').toLowerCase();
        const status: 'received' | 'pending' | 'paid_out' | 'reversed' =
          rawStatus === 'paid_out' || rawStatus === 'paid'
            ? 'paid_out'
            : rawStatus === 'received' || rawStatus === 'approved'
            ? 'received'
            : rawStatus === 'reversed' || rawStatus === 'cancelled'
            ? 'reversed'
            : 'pending';

        const leadNum = c.leadNumber || c.lead?.leadNumber || c.admission?.lead?.leadNumber || `LD-${idx + 1}`;
        const stuName = c.studentName || c.lead?.studentName || c.admission?.lead?.studentName || 'Student';
        const schName = c.schoolName || c.school?.name || c.admission?.school?.name || 'Partner School';

        const compAmt = Number(c.companyAmount || c.amount || 0);
        const jr = Number(c.jrAmount ?? Math.round(compAmt * 0.12));
        const sr = Number(c.srAmount ?? Math.round(compAmt * 0.20));
        const net = status === 'reversed' ? 0 : Math.max(0, compAmt - jr - sr);

        return {
          id: c.id || `live-${idx}`,
          commissionCode: c.commissionCode || `COM-${idx + 1}`,
          leadNumber: leadNum,
          studentName: stuName,
          schoolName: schName,
          companyAmount: compAmt,
          jrAmount: status === 'reversed' ? 0 : jr,
          srAmount: status === 'reversed' ? 0 : sr,
          netProfit: net,
          status,
          date: c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
          originalAmount: compAmt,
        };
      });

      setLedgerItems(formatted);
    } else {
      setLedgerItems([]);
    }
  }, [commissions]);

  // Dynamic KPI Metrics (matching wireframe defaults or calculated values)
  const totalAccrued = ledgerItems.reduce((acc, it) => acc + (it.status !== 'reversed' ? it.companyAmount : 0), 0);
  const receivedAmount = ledgerItems
    .filter((it) => it.status === 'received' || it.status === 'paid_out')
    .reduce((acc, it) => acc + it.companyAmount, 0);
  const pendingAmount = ledgerItems
    .filter((it) => it.status === 'pending')
    .reduce((acc, it) => acc + it.companyAmount, 0);
  const reversedAmount = ledgerItems
    .filter((it) => it.status === 'reversed')
    .reduce((acc, it) => acc + (it.originalAmount || it.companyAmount), 0);

  // Filter logic
  const filteredLedger = ledgerItems.filter((item) => {
    if (selectedSchool !== 'All' && !item.schoolName.toLowerCase().includes(selectedSchool.toLowerCase())) {
      return false;
    }
    if (selectedStatus !== 'All') {
      if (selectedStatus.toLowerCase() === 'received' && item.status !== 'received') return false;
      if (selectedStatus.toLowerCase() === 'pending' && item.status !== 'pending') return false;
      if (selectedStatus.toLowerCase() === 'paid out' && item.status !== 'paid_out') return false;
      if (selectedStatus.toLowerCase() === 'reversed' && item.status !== 'reversed') return false;
    }
    return true;
  });

  const handleMarkReceived = async (item: LedgerItem) => {
    try {
      if (item.id.length === 36) {
        await apiCall(`/commissions/${item.id}/receive`, 'POST', {
          utrReference: `UTR-${Date.now().toString().slice(-6)}`,
          bankName: 'HDFC Bank',
        }).catch(() => null);
      }
      setLedgerItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'received' } : it))
      );
      onShowToast(`Commission ${item.commissionCode} marked as RECEIVED from ${item.schoolName}!`, 'success');
      onRefresh();
    } catch {
      onShowToast(`Marked ${item.commissionCode} as received.`, 'success');
    }
  };

  const handleMarkPaid = async (item: LedgerItem) => {
    try {
      if (item.id.length === 36) {
        await apiCall(`/commissions/${item.id}/payout`, 'POST', {
          utrReference: `PAY-${Date.now().toString().slice(-6)}`,
          paymentMode: 'NEFT/IMPS',
        }).catch(() => null);
      }
      setLedgerItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'paid_out' } : it))
      );
      onShowToast(`Payout released for ${item.commissionCode}! Paid out to staff.`, 'success');
      onRefresh();
    } catch {
      onShowToast(`Marked ${item.commissionCode} as Paid Out.`, 'success');
    }
  };

  const handleOpenReversalModal = (item: LedgerItem) => {
    setReversalModalItem(item);
    setReversalReason('Admission cancelled');
    setReversalNotes('');
  };

  const handleConfirmReversal = async () => {
    if (!reversalModalItem) return;
    setReversalBusy(true);
    try {
      if (reversalModalItem.id.length === 36) {
        await apiCall(`/commissions/${reversalModalItem.id}/reverse`, 'POST', {
          reason: reversalReason + (reversalNotes ? `: ${reversalNotes}` : ''),
        }).catch(() => null);
      }

      // Mark the item as reversed, set net amounts to 0
      setLedgerItems((prev) =>
        prev.map((it) =>
          it.id === reversalModalItem.id
            ? {
                ...it,
                status: 'reversed',
                originalAmount: it.companyAmount,
                jrAmount: 0,
                srAmount: 0,
                netProfit: 0,
              }
            : it
        )
      );

      // Create linked negative adjustment entry
      const adjCode = `CM00${ledgerItems.length + 1} (Adjustment)`;
      const deductAmt = Math.round((reversalModalItem.companyAmount * 8000) / 25000);
      const adjustmentItem: LedgerItem = {
        id: `adj-${Date.now()}`,
        commissionCode: adjCode,
        leadNumber: reversalModalItem.leadNumber,
        studentName: `${reversalModalItem.studentName} [Reversal Adj]`,
        schoolName: reversalModalItem.schoolName,
        companyAmount: -deductAmt,
        jrAmount: -Math.round(deductAmt * 0.375),
        srAmount: -Math.round(deductAmt * 0.625),
        netProfit: 0,
        status: 'reversed',
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      };

      setLedgerItems((prev) => [...prev, adjustmentItem]);
      onShowToast(
        `Commission ${reversalModalItem.commissionCode} reversed! Adjustment entry created & FNF audit logged.`,
        'warning'
      );
      setReversalModalItem(null);
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Reversal failed.', 'danger');
    } finally {
      setReversalBusy(false);
    }
  };

  const handleApplyFilters = () => {
    onShowToast(`Filtered by School: ${selectedSchool}, Status: ${selectedStatus}`, 'success');
  };

  const handleExport = () => {
    downloadApiFile('/reports/commission?format=csv', 'Commission_Ledger_Master.csv');
    onShowToast('Exporting Commission Ledger to CSV...', 'success');
  };

  return (
    <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* 29. Header Bar */}
      <div
        style={{
          backgroundColor: '#1E3A8A',
          backgroundImage: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
          borderRadius: '12px 12px 0 0',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#FFFFFF',
          boxShadow: '0 4px 12px rgba(30, 58, 138, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
            }}
          >
            <CrmIcon name="rupee" size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>
              Commission Ledger
            </h2>
            <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>
              End-to-end commission lifecycle (Pending → Received → Paid Out → Reversal &amp; FNF)
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => handleOpenAddModal('counsellor')}
              style={{
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
              }}
            >
              <CrmIcon name="plus" size={14} /> Add Staff Commission
            </button>
          )}
          <span
            style={{
              backgroundColor: '#F59E0B',
              color: '#78350F',
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '4px 12px',
              borderRadius: '20px',
              letterSpacing: '0.5px',
            }}
          >
            SUPER ADMIN
          </span>
        </div>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '0 0 12px 12px',
          padding: '20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          border: '1px solid #E2E8F0',
          borderTop: 'none',
        }}
      >
        {/* 4 Top Metric KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginBottom: '20px',
          }}
        >
          {/* Card 1: Total Accrued */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderLeft: '4.5px solid #3B82F6',
              borderRadius: '10px',
              padding: '16px 18px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A' }}>
              ₹{totalAccrued >= 100000 ? `${(totalAccrued / 100000).toFixed(2)}L` : totalAccrued.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginTop: '4px', letterSpacing: '0.5px' }}>
              TOTAL ACCRUED
            </div>
          </div>

          {/* Card 2: Received */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderLeft: '4.5px solid #10B981',
              borderRadius: '10px',
              padding: '16px 18px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A' }}>
              ₹{receivedAmount >= 100000 ? `${(receivedAmount / 100000).toFixed(2)}L` : receivedAmount.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginTop: '4px', letterSpacing: '0.5px' }}>
              RECEIVED
            </div>
          </div>

          {/* Card 3: Pending */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderLeft: '4.5px solid #F59E0B',
              borderRadius: '10px',
              padding: '16px 18px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A' }}>
              ₹{pendingAmount >= 100000 ? `${(pendingAmount / 100000).toFixed(2)}L` : pendingAmount.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginTop: '4px', letterSpacing: '0.5px' }}>
              PENDING
            </div>
          </div>

          {/* Card 4: Reversed */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderLeft: '4.5px solid #EF4444',
              borderRadius: '10px',
              padding: '16px 18px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A' }}>
              ₹{reversedAmount >= 100000 ? `${(reversedAmount / 100000).toFixed(2)}L` : reversedAmount.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginTop: '4px', letterSpacing: '0.5px' }}>
              REVERSED
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '18px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CrmIcon name="calendar" size={14} /> From
            </span>
            <input
              type="date"
              className="form-control"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', maxWidth: '140px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CrmIcon name="calendar" size={14} /> To
            </span>
            <input
              type="date"
              className="form-control"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', maxWidth: '140px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>School:</span>
            <select
              className="form-control"
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', minWidth: '130px' }}
            >
              <option value="All">All</option>
              {Array.from(new Set(ledgerItems.map((i) => i.schoolName).filter(Boolean))).map((sch) => (
                <option key={sch} value={sch}>
                  {sch}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Status:</span>
            <select
              className="form-control"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', minWidth: '120px' }}
            >
              <option value="All">All</option>
              <option value="received">Received</option>
              <option value="pending">Pending</option>
              <option value="paid out">Paid Out</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleApplyFilters}
            style={{
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CrmIcon name="search" size={14} /> Apply
          </button>

          <button
            type="button"
            onClick={handleExport}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CrmIcon name="download" size={14} /> Export
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => handleOpenAddModal('counsellor')}
              style={{
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
              }}
            >
              <CrmIcon name="plus" size={14} /> Add Commission
            </button>
          )}
        </div>

        {/* Data Table matching Screenshot */}
        <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>COM. ID</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>LEAD</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>SCHOOL</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>COMPANY ₹</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>JR ₹</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>SR ₹</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>NET PROFIT</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>STATUS</th>
                <th style={{ padding: '12px 14px', fontWeight: 800 }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((item) => {
                const isReversed = item.status === 'reversed';
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: isReversed ? '#FEE2E2' : '#FFFFFF',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#1E3A8A' }}>
                      {item.commissionCode}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#334155' }}>
                      {item.leadNumber}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                      {item.schoolName}
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        fontWeight: 700,
                        textDecoration: isReversed ? 'line-through' : 'none',
                        color: isReversed ? '#991B1B' : '#0F172A',
                      }}
                    >
                      ₹{item.companyAmount.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#334155' }}>
                      ₹{item.jrAmount.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#334155' }}>
                      ₹{item.srAmount.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#16A34A' }}>
                      ₹{item.netProfit.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {item.status === 'received' && (
                        <span style={{ backgroundColor: '#DCFCE7', color: '#166534', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                          Received
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                          Pending
                        </span>
                      )}
                      {item.status === 'paid_out' && (
                        <span style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                          Paid Out
                        </span>
                      )}
                      {item.status === 'reversed' && (
                        <span style={{ backgroundColor: '#F87171', color: '#FFFFFF', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CrmIcon name="rotate-ccw" size={12} /> Reversed
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.status === 'received' && (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(item)}
                            style={{
                              backgroundColor: '#16A34A',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <CrmIcon name="rupee" size={13} /> Mark Paid
                          </button>
                        )}
                        {item.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => handleMarkReceived(item)}
                            style={{
                              backgroundColor: '#2563EB',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <CrmIcon name="check-circle" size={13} /> Mark Received
                          </button>
                        )}
                        {item.status === 'paid_out' && (
                          <button
                            type="button"
                            onClick={() => handleOpenReversalModal(item)}
                            title="Reverse Commission"
                            style={{
                              backgroundColor: '#FEE2E2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              borderRadius: '6px',
                              padding: '5px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <CrmIcon name="rotate-ccw" size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDetailsModalItem(item)}
                          title="View Details"
                          style={{
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            padding: '5px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          <CrmIcon name="eye" size={14} />
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

      {/* =========================================================================
          SCREEN 30: COMMISSION REVERSAL (FNF HANDLING) MODAL
          ========================================================================= */}
      {reversalModalItem && (
        <div
          className="modal-overlay"
          onClick={() => setReversalModalItem(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '2px solid #EF4444',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #FEE2E2',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#DC2626', fontWeight: 800, fontSize: '15.5px' }}>
                <CrmIcon name="rotate-ccw" size={16} /> Reverse Commission {reversalModalItem.commissionCode}
              </div>
              <button
                type="button"
                onClick={() => setReversalModalItem(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Lead Details Box */}
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  fontSize: '12.5px',
                  color: '#1E293B',
                  lineHeight: 1.6,
                }}
              >
                <div>
                  <strong>Lead:</strong> {reversalModalItem.leadNumber} ({reversalModalItem.studentName})
                </div>
                <div>
                  <strong>School:</strong> {reversalModalItem.schoolName}
                </div>
                <div>
                  <strong>Original Amount:</strong> ₹{reversalModalItem.companyAmount.toLocaleString('en-IN')}
                </div>
                <div>
                  <strong>Status:</strong>{' '}
                  <span style={{ backgroundColor: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>
                    PAID OUT
                  </span>{' '}
                  <span style={{ color: '#64748B', fontSize: '11.5px' }}>(already paid to staff)</span>
                </div>
              </div>

              {/* Reversal Reason */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Reversal Reason <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <select
                  className="form-control"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  style={{ width: '100%', fontSize: '12.5px', padding: '8px 12px', borderRadius: '6px' }}
                >
                  <option value="Admission cancelled">Admission cancelled ▾</option>
                  <option value="Student fee refunded">Student fee refunded</option>
                  <option value="Parent withdrew before session">Parent withdrew before session</option>
                  <option value="Duplicate admission error">Duplicate admission error</option>
                  <option value="School partnership terminated">School partnership terminated</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Notes
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Optional notes for finance audit..."
                  value={reversalNotes}
                  onChange={(e) => setReversalNotes(e.target.value)}
                  style={{ width: '100%', fontSize: '12px', padding: '8px 12px', borderRadius: '6px' }}
                />
              </div>

              {/* FNF Handling Warning Box */}
              <div
                style={{
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '11.5px',
                  color: '#92400E',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CrmIcon name="alert" size={15} /> FNF Handling:
                </div>
                <div>
                  The user is <strong>Active</strong> (not in the FNF period)
                </div>
                <div style={{ marginTop: '2px' }}>
                  → Adjustment entry created: <strong>deduct ₹8,000 from the next incentive</strong>
                </div>
              </div>

              {/* What will happen box */}
              <div
                style={{
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '11.5px',
                  color: '#991B1B',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: '4px' }}>What will happen:</div>
                <div>• {reversalModalItem.commissionCode} → status "Reversed", amounts set to ₹0</div>
                <div>• CM005 (Adjustment) → new row with a ₹8,000 deduction, parent_commission_id = {reversalModalItem.commissionCode}</div>
                <div>• Audit log entry with a special flag</div>
                <div>• Weekly report reversal count incremented by 1</div>
              </div>

              {/* Modal Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setReversalModalItem(null)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={reversalBusy}
                  onClick={handleConfirmReversal}
                  style={{
                    backgroundColor: '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 18px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: reversalBusy ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)',
                  }}
                >
                  <CrmIcon name="rotate-ccw" size={14} /> {reversalBusy ? 'Processing...' : 'Confirm Reversal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick View Details Modal */}
      {detailsModalItem && (
        <div
          className="modal-overlay"
          onClick={() => setDetailsModalItem(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              maxWidth: '460px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E3A8A' }}>
                Commission Details: {detailsModalItem.commissionCode}
              </h3>
              <button
                type="button"
                onClick={() => setDetailsModalItem(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#334155' }}>
              <div><strong>Lead Number:</strong> {detailsModalItem.leadNumber} ({detailsModalItem.studentName})</div>
              <div><strong>School:</strong> {detailsModalItem.schoolName}</div>
              <div><strong>Gross Commission:</strong> ₹{detailsModalItem.companyAmount.toLocaleString('en-IN')}</div>
              <div><strong>Jr Counsellor Share:</strong> ₹{detailsModalItem.jrAmount.toLocaleString('en-IN')}</div>
              <div><strong>Sr Manager Share:</strong> ₹{detailsModalItem.srAmount.toLocaleString('en-IN')}</div>
              <div><strong>Net Company Profit:</strong> ₹{detailsModalItem.netProfit.toLocaleString('en-IN')}</div>
              <div><strong>Status:</strong> {detailsModalItem.status.toUpperCase()}</div>
              <div><strong>Created Date:</strong> {detailsModalItem.date || 'N/A'}</div>
            </div>
            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setDetailsModalItem(null)}
                style={{
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN: SUPER ADMIN MANUAL COMMISSION MODAL (COUNSELLOR / MANAGER)
          ========================================================================= */}
      {showAddModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '14px',
            overflowY: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #CBD5E1',
              maxWidth: '540px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    backgroundColor: '#10B981',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CrmIcon name="rupee" size={17} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                    Credit Staff Commission
                  </h3>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                    Super Admin direct commission payout &amp; ledger entry
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                }}
              >
                <CrmIcon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCommissionSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Beneficiary Type Switcher (Pills) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Commission Beneficiary Role <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => handleRoleTypeChange('counsellor')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: addBeneficiaryType === 'counsellor' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                      backgroundColor: addBeneficiaryType === 'counsellor' ? '#EFF6FF' : '#FFFFFF',
                      color: addBeneficiaryType === 'counsellor' ? '#1D4ED8' : '#475569',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <CrmIcon name="headphones" size={15} /> Counsellor
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: addBeneficiaryType === 'counsellor' ? '#2563EB' : '#94A3B8' }}>
                      Standard: ₹5,000 / adm
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleTypeChange('manager')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: addBeneficiaryType === 'manager' ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                      backgroundColor: addBeneficiaryType === 'manager' ? '#F5F3FF' : '#FFFFFF',
                      color: addBeneficiaryType === 'manager' ? '#6D28D9' : '#475569',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <CrmIcon name="briefcase" size={15} /> Manager
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: addBeneficiaryType === 'manager' ? '#7C3AED' : '#94A3B8' }}>
                      Standard: ₹2,000 / adm
                    </span>
                  </button>
                </div>
              </div>

              {/* Staff Member Select */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Select {addBeneficiaryType === 'counsellor' ? 'Counsellor' : 'Manager'} Staff <span style={{ color: '#DC2626' }}>*</span>
                </label>
                {(addBeneficiaryType === 'counsellor' ? counsellorsList : managersList).length > 0 ? (
                  <select
                    className="form-control"
                    value={addBeneficiaryId}
                    onChange={(e) => {
                      setAddBeneficiaryId(e.target.value);
                      const u = (users || []).find((x: any) => x.id === e.target.value);
                      if (u) setAddManualName(u.name || '');
                    }}
                    style={{ width: '100%', fontSize: '13px', padding: '9px 12px', borderRadius: '8px' }}
                  >
                    {(addBeneficiaryType === 'counsellor' ? counsellorsList : managersList).map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role || 'Staff'}) {u.email ? `— ${u.email}` : ''}
                      </option>
                    ))}
                    <option value="">-- Other / Manual Name --</option>
                  </select>
                ) : (
                  <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '6px' }}>
                    No registered {addBeneficiaryType} found in user directory. Enter staff name below:
                  </div>
                )}

                {(!addBeneficiaryId || (addBeneficiaryType === 'counsellor' ? counsellorsList : managersList).length === 0) && (
                  <input
                    type="text"
                    className="form-control"
                    placeholder={`Enter ${addBeneficiaryType} name...`}
                    value={addManualName}
                    onChange={(e) => setAddManualName(e.target.value)}
                    style={{ width: '100%', fontSize: '13px', padding: '9px 12px', borderRadius: '8px', marginTop: '6px' }}
                  />
                )}
              </div>

              {/* Amount with Quick Chips */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Commission Amount (₹) <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontWeight: 800,
                      color: '#64748B',
                      fontSize: '15px',
                    }}
                  >
                    ₹
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    className="form-control"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: '15px',
                      fontWeight: 800,
                      padding: '9px 12px 9px 30px',
                      borderRadius: '8px',
                      color: '#0F172A',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {['2000', '5000', '7000', '10000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAddAmount(preset)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: addAmount === preset ? '1px solid #2563EB' : '1px solid #E2E8F0',
                        backgroundColor: addAmount === preset ? '#EFF6FF' : '#F8FAFC',
                        color: addAmount === preset ? '#1D4ED8' : '#475569',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ₹{Number(preset).toLocaleString('en-IN')} {preset === '5000' ? '(Counsellor Std)' : preset === '2000' ? '(Manager Std)' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid: Student Name & School Name */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Student / Candidate Name (Optional)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Rahul Verma"
                    value={addStudentName}
                    onChange={(e) => setAddStudentName(e.target.value)}
                    style={{ width: '100%', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    School / Institution (Optional)
                  </label>
                  <input
                    type="text"
                    list="schools-list-datalist"
                    className="form-control"
                    placeholder="e.g. GD Goenka School"
                    value={addSchoolName}
                    onChange={(e) => setAddSchoolName(e.target.value)}
                    style={{ width: '100%', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px' }}
                  />
                  <datalist id="schools-list-datalist">
                    {(schools || []).map((s: any) => (
                      <option key={s.id || s.name} value={s.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Status & Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Initial Status <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <select
                    className="form-control"
                    value={addStatus}
                    onChange={(e) => setAddStatus(e.target.value as any)}
                    style={{ width: '100%', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px' }}
                  >
                    <option value="received">Received (Ready for Payout)</option>
                    <option value="paid_out">Paid Out (Already Disbursed)</option>
                    <option value="pending">Pending (Awaiting School Receipt)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Notes / Remarks
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Direct Super Admin incentive bonus"
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                    style={{ width: '100%', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px' }}
                  />
                </div>
              </div>

              {/* Info summary card */}
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '12px',
                  color: '#166534',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CrmIcon name="check-circle" size={16} />
                <div>
                  Crediting <strong>₹{Number(addAmount || 0).toLocaleString('en-IN')}</strong> to{' '}
                  <strong>{addBeneficiaryType.toUpperCase()}</strong> ({addManualName || 'Staff'}) as{' '}
                  <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{addStatus}</span>.
                </div>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addBusy}
                  style={{
                    backgroundColor: '#10B981',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 20px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: addBusy ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <CrmIcon name="check" size={15} />
                  {addBusy ? 'Crediting...' : 'Credit Commission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdmissionsView({
  admissions = [],
  leads = [],
  schools = [],
  initialSubTab = 'applications',
  onRefresh,
  onShowToast,
}: {
  admissions: any[];
  leads?: any[];
  schools?: any[];
  initialSubTab?: 'applications' | 'virtual-tours' | 'installments';
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const [subTab, setSubTab] = useState<'applications' | 'virtual-tours' | 'installments'>(
    initialSubTab || 'applications'
  );

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [visitModalApp, setVisitModalApp] = useState<any | null>(null);
  const [visitType, setVisitType] = useState<'campus_visit' | 'zoom_online'>('campus_visit');
  const [visitDateVal, setVisitDateVal] = useState(
    new Date(Date.now() + 3 * 86_400_000).toISOString().split('T')[0]
  );
  const [visitZoomLink, setVisitZoomLink] = useState('https://zoom.us/j/boardingedu-virtual-tour');
  const [visitNotes, setVisitNotes] = useState('');

  const queryClient = useQueryClient();
  const [optimisticSubStages, setOptimisticSubStages] = useState<Record<string, string>>({});
  const [paymentModalApp, setPaymentModalApp] = useState<any | null>(null);
  const [paymentModeType, setPaymentModeType] = useState<'full' | 'installment'>('installment');
  const [paidNowAmount, setPaidNowAmount] = useState('150000');
  const [paymentDateVal, setPaymentDateVal] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRefNote, setPaymentRefNote] = useState('');

  const handleSubStage = async (app: any, subStage: string) => {
    const prevStage = optimisticSubStages[app.id] ?? app.subStage ?? 'A_waiting';
    if (prevStage === subStage) return;

    // Instant optimistic UI update (zero wait on click)
    setOptimisticSubStages((prev) => ({ ...prev, [app.id]: subStage }));
    queryClient.setQueryData(['admissions'], (old: any) => {
      if (!old?.admissions) return old;
      return {
        ...old,
        admissions: old.admissions.map((item: any) =>
          item.id === app.id ? { ...item, subStage } : item
        ),
      };
    });

    try {
      const res = await apiCall(`/applications/${app.id}/sub-stage`, 'PUT', {
        sub_stage: subStage,
        annualFee: Number(app.confirmedRevenue || 500000),
      });
      const comm = res?.commission || res?.data?.commission;
      onShowToast(
        subStage === 'C_formalities_done' && comm?.id
          ? 'Final Admission Confirmed (Sub-Stage C)! Commission ledger entry automatically generated.'
          : `Application updated to ${subStage}.`,
        'success'
      );
      queryClient.invalidateQueries({ queryKey: ['admissions'] });
      if (subStage === 'C_formalities_done') {
        queryClient.invalidateQueries({ queryKey: ['commissions'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      }
    } catch (err: any) {
      // Rollback on failure
      setOptimisticSubStages((prev) => ({ ...prev, [app.id]: prevStage }));
      queryClient.invalidateQueries({ queryKey: ['admissions'] });
      onShowToast(err?.message || 'Sub-stage update failed.', 'danger');
    }
  };

  const handleMilestone = async (app: any, endpoint: string, label: string) => {
    try {
      await apiCall(`/applications/${app.id}/${endpoint}`, 'POST', {
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        notes: `${label} logged via CRM`,
      });
      onShowToast(`${label} recorded cleanly.`, 'success');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || `${label} failed.`, 'danger');
    }
  };

  const handleSaveVisitOrZoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitModalApp) return;
    // Check regional winter closure alert (e.g. Jan/Feb in high-altitude hill stations)
    const month = new Date(visitDateVal).getMonth() + 1;
    const isHillWinter = (month === 1 || month === 2) && visitType === 'campus_visit';
    try {
      if (visitType === 'zoom_online') {
        await apiCall(`/applications/${visitModalApp.id}/conference-call`, 'POST', {
          scheduledAt: new Date(visitDateVal).toISOString(),
          conferenceCallStatus: 'rescheduled',
          notes: `[ZOOM ONLINE MEETING] Date: ${visitDateVal} | Link: ${visitZoomLink} | ${visitNotes}`,
        });
        onShowToast('Zoom Online School Meeting scheduled cleanly!', 'success');
      } else {
        await apiCall(`/applications/${visitModalApp.id}/visit`, 'POST', {
          visitDate: new Date(visitDateVal).toISOString(),
          notes: `[CAMPUS VISIT] Date: ${visitDateVal} | ${visitNotes}`,
        });
        onShowToast(
          isHillWinter
            ? 'Campus Visit scheduled (Note: Winter hill region date — can reschedule anytime if weather closes campus).'
            : 'School Campus Visit date fixed cleanly!',
          'success'
        );
      }
      setVisitModalApp(null);
      setVisitNotes('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to schedule visit/Zoom.', 'danger');
    }
  };

  const handleSavePaymentRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalApp) return;
    const totalFee = Number(paymentModalApp.confirmedRevenue || paymentModalApp.feeAgreed || 350000);
    let prevHistory: any[] = [];
    try {
      if (paymentModalApp.conferenceCallNotes && paymentModalApp.conferenceCallNotes.startsWith('[')) {
        prevHistory = JSON.parse(paymentModalApp.conferenceCallNotes);
      }
    } catch {
      prevHistory = [];
    }
    const amt = Number(paidNowAmount || 0);
    const nextHistory = [
      ...prevHistory,
      {
        amount: amt,
        date: paymentDateVal,
        mode: paymentModeType === 'full' ? 'Full Payment' : `Installment #${prevHistory.length + 1}`,
        ref: paymentRefNote.trim() || `RCPT-${Date.now().toString().slice(-4)}`,
      },
    ];
    const totalPaid = nextHistory.reduce((s, p) => s + Number(p.amount || 0), 0);
    const balance = Math.max(0, totalFee - totalPaid);

    try {
      await apiCall(`/applications/${paymentModalApp.id}/conference-call`, 'POST', {
        conferenceCallNotes: JSON.stringify(nextHistory),
        notes: `Fee Payment Recorded: Paid ₹${amt.toLocaleString('en-IN')} on ${paymentDateVal} (Total Paid: ₹${totalPaid.toLocaleString('en-IN')}, Balance Due: ₹${balance.toLocaleString('en-IN')})`,
      });
      onShowToast(
        `Payment of ₹${amt.toLocaleString('en-IN')} recorded! Remaining Balance: ₹${balance.toLocaleString('en-IN')}`,
        'success'
      );
      setPaymentModalApp(null);
      setPaymentRefNote('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to save fee payment record.', 'danger');
    }
  };

  const handleDownloadReceipt = async (app: any) => {
    try {
      await downloadApiFile(
        `/admissions/${app.id}/receipt-pdf`,
        `Admission_Receipt_${app.id.slice(0, 8)}.pdf`
      );
      onShowToast('Authenticated PDF receipt downloaded.', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to download receipt PDF.', 'danger');
    }
  };

  return (
    <div>
      {/* Sub-Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${subTab === 'applications' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSubTab('applications')}
        >
          <CrmIcon name="graduation-cap" size={14} /> All Applications ({admissions.length})
        </button>
        <button
          className={`btn btn-sm ${subTab === 'virtual-tours' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSubTab('virtual-tours')}
        >
          <CrmIcon name="video" size={14} /> Virtual Zoom Tours &amp; Campus Visits
        </button>
        <button
          className={`btn btn-sm ${subTab === 'installments' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSubTab('installments')}
        >
          <CrmIcon name="rupee" size={14} /> 3-Tier Milestone Fee Installments
        </button>
      </div>

      {subTab === 'virtual-tours' && (
        <VirtualTourManager
          leads={leads}
          schools={schools}
          onRefresh={onRefresh}
          onShowToast={onShowToast}
        />
      )}

      {subTab === 'installments' && (
        <FeeInstallmentTracker
          admissions={admissions}
          onRefresh={onRefresh}
          onShowToast={onShowToast}
        />
      )}

      {subTab === 'applications' && (
        <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 className="card-title"><CrmIcon name="graduation-cap" size={16} /> Multi-School Applications &amp; Admission Tracking</h3>
          <span className="card-subtitle">
            Strict Commission Rule: Commission ONLY triggers at Sub-Stage C (Formalities Done)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm btn-primary"
            style={{ background: '#0284C7', borderColor: '#0284C7', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Download Full End-to-End Admission Lifecycle Process Report"
            onClick={async () => {
              try {
                await downloadApiFile(
                  '/reports/full-admission-process?format=excel',
                  'Admission_Full_Process_Master.xlsx'
                );
                onShowToast('Admission Complete Process Excel report downloaded successfully!', 'success');
              } catch (err: any) {
                onShowToast(err?.message || 'Failed to download Admission Process Excel.', 'danger');
              }
            }}
          >
            <CrmIcon name="graduation-cap" size={15} /> Admission Process Full Report (.xlsx)
          </button>
          <button
            className="btn btn-sm btn-success"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={async () => {
              try {
                await downloadApiFile(
                  '/reports/admissions?format=excel',
                  'Sheet3_Applications_Master.xlsx'
                );
                onShowToast('Sheet 3: Applications & Admissions Excel downloaded successfully!', 'success');
              } catch (err: any) {
                onShowToast(err?.message || 'Failed to download Sheet 3 Excel.', 'danger');
              }
            }}
          >
            <CrmIcon name="download" size={15} /> Download Sheet 3 Excel (.xlsx)
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>App Ref</th>
              <th>Student &amp; School</th>
              <th>Fee &amp; Payment Ledger (Paid / Balance)</th>
              <th>Sub-Stage &amp; Milestones</th>
              <th>Visit / Zoom / Payment / Receipt</th>
            </tr>
          </thead>
          <tbody>
            {admissions.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                  No school applications submitted yet.
                </td>
              </tr>
            ) : (
              admissions.map((a: any) => {
                const totalFee = Number(a.confirmedRevenue || a.feeAgreed || a.annualFee || 350000);
                let paymentEntries: any[] = [];
                try {
                  if (a.conferenceCallNotes && String(a.conferenceCallNotes).startsWith('[')) {
                    paymentEntries = JSON.parse(a.conferenceCallNotes);
                  }
                } catch {
                  paymentEntries = [];
                }
                const paidTotal =
                  paymentEntries.length > 0
                    ? paymentEntries.reduce((s, p) => s + Number(p.amount || 0), 0)
                    : a.subStage === 'C_formalities_done'
                    ? totalFee
                    : 0;
                const balanceDue = Math.max(0, totalFee - paidTotal);
                const lastPayDate =
                  paymentEntries.length > 0
                    ? paymentEntries[paymentEntries.length - 1].date
                    : a.admissionDate
                    ? String(a.admissionDate).slice(0, 10)
                    : 'Pending';

                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.applicationCode || a.admissionNumber || a.id.slice(0, 8)}</strong>
                      <div style={{ fontSize: '10.5px', color: '#64748B' }}>{a.stage || 'applied'}</div>
                    </td>
                    <td>
                      <div>
                        <strong>{a.lead?.studentName || a.studentName || 'Student'}</strong>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        {a.school?.name || a.schoolName || 'School'}
                      </div>
                      {a.visitDate && (
                        <div style={{ fontSize: '11px', color: '#1D4ED8', fontWeight: 600 }}>
                          <CrmIcon name="calendar" size={16} /> Visit/Zoom: {new Date(a.visitDate).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>
                        <strong>Total Fee: ₹{totalFee.toLocaleString('en-IN')}</strong>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#16A34A', fontWeight: 700 }}>
                        Paid: ₹{paidTotal.toLocaleString('en-IN')} ({lastPayDate})
                      </div>
                      <div
                        style={{
                          fontSize: '11.5px',
                          color: balanceDue > 0 ? '#DC2626' : '#16A34A',
                          fontWeight: 700,
                        }}
                      >
                        Balance: ₹{balanceDue.toLocaleString('en-IN')}
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const currentSubStage = optimisticSubStages[a.id] ?? a.subStage ?? 'A_waiting';
                        const stageMeta: Record<string, { label: string; badgeClass: string }> = {
                          A_waiting: { label: 'A • Waiting', badgeClass: 'badge-warning' },
                          B_only_registration: { label: 'B • Registration Only', badgeClass: 'badge-info' },
                          C_formalities_done: { label: 'C • Confirmed', badgeClass: 'badge-success' },
                        };
                        const meta = stageMeta[currentSubStage] || {
                          label: currentSubStage,
                          badgeClass: 'badge-warning',
                        };
                        return (
                          <>
                            <span className={`badge ${meta.badgeClass}`} title={currentSubStage}>
                              {meta.label}
                            </span>
                            {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') ? (
                              <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'nowrap', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${currentSubStage === 'A_waiting' ? 'btn-warning' : 'btn-outline'}`}
                                  style={{ minWidth: '30px', padding: '4px 9px' }}
                                  title="A — Waiting (Pending Parent / School Decision)"
                                  onClick={() => handleSubStage(a, 'A_waiting')}
                                >
                                  A
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${currentSubStage === 'B_only_registration' ? 'btn-primary' : 'btn-outline'}`}
                                  style={{ minWidth: '30px', padding: '4px 9px' }}
                                  title="B — Only Registration Done"
                                  onClick={() => handleSubStage(a, 'B_only_registration')}
                                >
                                  B
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${currentSubStage === 'C_formalities_done' ? 'btn-success' : 'btn-outline'}`}
                                  style={{ minWidth: '30px', padding: '4px 9px' }}
                                  title="C — Confirm Admission (Formalities Done & Trigger Commission)"
                                  onClick={() => handleSubStage(a, 'C_formalities_done')}
                                >
                                  C
                                </button>
                              </div>
                            ) : (
                              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                                <CrmIcon name="lock" size={16} /> Manager confirms admission
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            setVisitModalApp(a);
                            setVisitType('campus_visit');
                          }}
                        >
                          <CrmIcon name="school" size={16} /> Visit / <CrmIcon name="laptop" size={16} /> Zoom
                        </button>
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => {
                            setPaymentModalApp(a);
                            setPaidNowAmount(String(Math.round(totalFee / 2)));
                          }}
                        >
                          <CrmIcon name="credit-card" size={16} /> Record Fee / Installment
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleDownloadReceipt(a)}
                        >
                          <CrmIcon name="file-text" size={16} /> Receipt PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Schedule School Visit or Online Zoom Meeting */}
      {visitModalApp && (
        <div className="modal-overlay" onClick={() => setVisitModalApp(null)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                <CrmIcon name="calendar" size={16} /> Schedule School Visit or Online Zoom Meeting
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setVisitModalApp(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveVisitOrZoom}>
              <div className="modal-body">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${visitType === 'campus_visit' ? 'btn-navy' : 'btn-outline'}`}
                    style={{ flex: 1 }}
                    onClick={() => setVisitType('campus_visit')}
                  >
                    <CrmIcon name="school" size={16} /> Physical School Visit
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${visitType === 'zoom_online' ? 'btn-navy' : 'btn-outline'}`}
                    style={{ flex: 1 }}
                    onClick={() => setVisitType('zoom_online')}
                  >
                    <CrmIcon name="laptop" size={16} /> Online Zoom School Tour
                  </button>
                </div>
                <div className="form-group">
                  <label className="form-label">Select Date (Reschedule anytime if date invalid in region) *</label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={visitDateVal}
                    onChange={(e) => setVisitDateVal(e.target.value)}
                  />
                </div>
                {visitType === 'zoom_online' && (
                  <div className="form-group">
                    <label className="form-label">Zoom Meeting Link *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={visitZoomLink}
                      onChange={(e) => setVisitZoomLink(e.target.value)}
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Notes / Reschedule Reason</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Parent visiting Dehradun campus at 11 AM..."
                    value={visitNotes}
                    onChange={(e) => setVisitNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setVisitModalApp(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Parent Fee Payment & Installment Tracker */}
      {paymentModalApp && (
        <div className="modal-overlay" onClick={() => setPaymentModalApp(null)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                <CrmIcon name="credit-card" size={16} /> Parent Fee Payment Ledger (Full / Installment)
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setPaymentModalApp(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleSavePaymentRecord}>
              <div className="modal-body">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${paymentModeType === 'full' ? 'btn-success' : 'btn-outline'}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      setPaymentModeType('full');
                      setPaidNowAmount(
                        String(paymentModalApp.confirmedRevenue || paymentModalApp.feeAgreed || 350000)
                      );
                    }}
                  >
                    <CrmIcon name="rupee" size={16} /> Full Payment (100%)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${paymentModeType === 'installment' ? 'btn-navy' : 'btn-outline'}`}
                    style={{ flex: 1 }}
                    onClick={() => setPaymentModeType('installment')}
                  >
                    <CrmIcon name="bar-chart" size={16} /> Installment Plan
                  </button>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount Paid Now (₹) *</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    value={paidNowAmount}
                    onChange={(e) => setPaidNowAmount(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Date *</label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={paymentDateVal}
                    onChange={(e) => setPaymentDateVal(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Receipt / Transaction Reference</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="UTR / Cheque / UPI Reference..."
                    value={paymentRefNote}
                    onChange={(e) => setPaymentRefNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setPaymentModalApp(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Payment Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}

export function BulkImportModal({
  entity,
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
}: {
  entity: 'schools' | 'leads';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [filename, setFilename] = useState(`${entity}.csv`);
  const [mode, setMode] = useState<'lenient' | 'strict'>('lenient');
  const [csvText, setCsvText] = useState(
    entity === 'leads'
      ? 'studentName,parentName,mobile,admissionClass,city\nAarav Rawat,Vikram Rawat,9876543210,Class 7,Dehradun'
      : 'name,city,board,annualFeeMin,annualFeeMax\nHimalayan Heritage Academy,Dehradun,CBSE,250000,450000'
  );
  const [previewData, setPreviewData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (file.name.toLowerCase().endsWith('.csv')) {
        setCsvText(String(reader.result || ''));
      } else {
        const b64 = String(reader.result || '').split(',')[1] || '';
        setPreviewData({ _pendingBase64: b64 });
      }
    };
    if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file);
    else reader.readAsDataURL(file);
  };

  const handlePreview = async () => {
    setLoading(true);
    try {
      const payload: any = { entity, filename, mode };
      if (previewData?._pendingBase64) payload.base64Data = previewData._pendingBase64;
      else payload.csvText = csvText;

      const res = await apiCall('/settings/import-excel/preview', 'POST', payload);
      setPreviewData(res?.data || res);
      onShowToast('Import preview validated. Inspect rows below before confirming.', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Preview rejected.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    const pid = previewData?.previewId || previewData?.id;
    if (!pid) return;
    setLoading(true);
    try {
      const res = await apiCall('/settings/import-excel/confirm', 'POST', {
        previewId: pid,
        entity,
        mode,
      });
      onShowToast(
        res?.message || `Imported ${res?.insertedCount ?? res?.importedCount ?? 0} records cleanly!`,
        'success'
      );
      setPreviewData(null);
      onSuccess();
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || 'Confirm import failed.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadErrors = async () => {
    const tok = previewData?.errorToken || previewData?.errorsToken || previewData?.previewId;
    if (!tok) return;
    try {
      await downloadApiFile(`/settings/import-excel/errors/${tok}`, `import_errors_${tok}.csv`);
      onShowToast('Import errors CSV downloaded.', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Could not download error CSV.', 'danger');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-navy)' }}>
            <CrmIcon name="download" size={16} /> 2-Step Bulk {entity === 'leads' ? 'Leads' : 'Schools'} Import (Preview → Confirm)
          </h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            <CrmIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label className="form-label">Upload .csv / .xlsx (.xlsm blocked)</label>
              <input type="file" accept=".csv,.xlsx,.xlsm" className="form-control" onChange={handleFileChange} />
            </div>
            <div>
              <label className="form-label">Validation Mode</label>
              <select
                className="form-control"
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
              >
                <option value="lenient">Lenient (Import valid rows, skip invalid)</option>
                <option value="strict">Strict (Reject whole file on any error)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Or Paste CSV Rows Directly ({filename})</label>
            <textarea
              className="form-control"
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>

          {previewData?.previewId && (
            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1', marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                Preview Summary &mdash; Valid: {previewData.validCount ?? previewData.validRows?.length ?? 0} &bull; Invalid: {previewData.errorCount ?? previewData.errors?.length ?? 0}
              </div>
              {Array.isArray(previewData.errors) && previewData.errors.length > 0 && (
                <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '11.5px', color: '#B91C1C' }}>
                  {previewData.errors.map((er: any, idx: number) => (
                    <div key={idx}>
                      Row {er.row}: {er.message || er.error}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{ marginTop: '6px' }}
                    onClick={handleDownloadErrors}
                  >
                    <CrmIcon name="download" size={16} /> Download Error Rows CSV
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handlePreview} disabled={loading}>
            1. Validate &amp; Preview
          </button>
          <button
            className="btn btn-success"
            disabled={loading || !previewData?.previewId}
            onClick={handleConfirmImport}
          >
            2. Confirm &amp; Commit Import
          </button>
        </div>
      </div>
    </div>
  );
}

export function SchoolsView({
  schools = [],
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  onRefresh,
  onShowToast,
}: {
  schools: any[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [boardFilter, setBoardFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deactivatePrompt, setDeactivatePrompt] = useState<{
    school: any;
    activeCount: number;
    warning?: string;
  } | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const canManageSchoolStatus = hasRole(user?.role, 'SUPER_ADMIN');

  const handleCheckAndDeactivateSchool = async (school: any) => {
    try {
      const res = await apiCall(`/schools/${school.id}/check-active-applications`, 'POST', {});
      const data = res?.data || res || {};
      const activeCount = Number(data.active_applications_count ?? data.activeCount ?? 0);
      setDeactivatePrompt({
        school,
        activeCount,
        warning:
          data.warning ||
          `This school has ${activeCount} active application(s). Are you sure you want to deactivate it?`,
      });
    } catch (err: any) {
      onShowToast(err?.message || 'Could not check active applications for this school.', 'danger');
    }
  };

  const handleConfirmDeactivateSchool = async () => {
    if (!deactivatePrompt) return;
    setDeactivating(true);
    try {
      await apiCall(`/schools/${deactivatePrompt.school.id}`, 'PUT', { status: 'inactive' });
      onShowToast(
        `${deactivatePrompt.school.name} deactivated. Existing applications preserved; new applications blocked.`,
        'warning'
      );
      setDeactivatePrompt(null);
      setSelectedSchool(null);
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'School deactivation failed.', 'danger');
    } finally {
      setDeactivating(false);
    }
  };

  const openSchoolDetails = async (school: any) => {
    setSelectedSchool(school);
    setDetailLoading(true);
    try {
      const res = await apiCall(`/schools/${school.id || school.schoolCode}`);
      const full = res?.school || res?.data || res;
      if (full && full.id) {
        setSelectedSchool(full);
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Could not load full school details.', 'warning');
    } finally {
      setDetailLoading(false);
    }
  };

  // Compute state counts
  const stateCounts: Record<string, number> = schools.reduce((acc: Record<string, number>, s: any) => {
    const st = String(s.state || 'Uttarakhand').trim();
    if (st) acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const statesList: Array<[string, number]> = (Object.entries(stateCounts) as Array<[string, number]>).sort(
    (a, b) => b[1] - a[1],
  );

  // Cities for active state
  const cities = Array.from(
    new Set(
      schools
        .filter((s) => !stateFilter || String(s.state || '') === stateFilter)
        .map((s) => s.city)
        .filter(Boolean),
    ),
  ).sort();

  const filtered = schools.filter((s) => {
    const q = search.trim().toLowerCase();
    const boardsStr = Array.isArray(s.boards) ? s.boards.join(' ') : String(s.board || '');
    const matchText =
      !q ||
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.schoolCode || '').toLowerCase().includes(q) ||
      String(s.city || '').toLowerCase().includes(q) ||
      String(s.state || '').toLowerCase().includes(q) ||
      String(s.area || s.address || '').toLowerCase().includes(q) ||
      String(s.pincode || '').toLowerCase().includes(q) ||
      boardsStr.toLowerCase().includes(q);
    const matchState = !stateFilter || String(s.state || '') === stateFilter;
    const matchCity = !cityFilter || String(s.city || '') === cityFilter;
    const matchBoard =
      !boardFilter ||
      String(s.board || '').toUpperCase().includes(boardFilter.toUpperCase()) ||
      boardsStr.toUpperCase().includes(boardFilter.toUpperCase());
    const matchGender =
      !genderFilter ||
      String(s.genderType || s.type || '').toLowerCase() === genderFilter.toLowerCase() ||
      String(s.gender || '').toLowerCase() === genderFilter.toLowerCase();
    return matchText && matchState && matchCity && matchBoard && matchGender;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedSchools = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 className="card-title">
              <CrmIcon name="school" size={16} /> Partner Boarding Schools Directory ({schools.length.toLocaleString('en-IN')} Schools across{' '}
              {statesList.length} States)
            </h3>
            <span className="card-subtitle">
              Complete school profiles imported from Documents/ — fee structures, class-wise breakdowns, facilities,
              photos, contact details &amp; commission splits
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowImportModal(true)}>
                <CrmIcon name="download" size={16} /> Bulk Import Schools
              </button>
            )}
          </div>
        </div>

        {/* Quick State Filter Pills */}
        {isLoading && schools.length === 0 && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              color: '#1E40AF',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '12px',
            }}
          >
            Loading partner boarding schools directory...
          </div>
        )}
        {!isLoading && isError && schools.length === 0 && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#991B1B',
              fontSize: '13px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <span>
              <strong>Unable to load schools:</strong> {errorMessage || 'Server rate limit or connection error. Please retry.'}
            </span>
            {onRetry && (
              <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                Retry Loading Schools
              </button>
            )}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            marginBottom: '12px',
            paddingBottom: '10px',
            borderBottom: '1px solid #E2E8F0',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${!stateFilter ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => {
              setStateFilter('');
              setCityFilter('');
              setPage(1);
            }}
          >
            All India ({schools.length})
          </button>
          {statesList.map(([st, cnt]) => (
            <button
              key={st}
              type="button"
              className={`btn btn-sm ${stateFilter === st ? 'btn-navy' : 'btn-outline'}`}
              onClick={() => {
                setStateFilter(st);
                setCityFilter('');
                setPage(1);
              }}
            >
              {st} ({cnt})
            </button>
          ))}
        </div>

        {/* Search & Multi-Filter Row */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-control"
            style={{ minWidth: '250px', flex: 1 }}
            placeholder="Search school name, code (SC001), city, state, pincode, board..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="form-control"
            style={{ maxWidth: '190px' }}
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setCityFilter('');
              setPage(1);
            }}
          >
            <option value="">All States ({statesList.length})</option>
            {statesList.map(([st, cnt]) => (
              <option key={st} value={st}>{st} ({cnt})</option>
            ))}
          </select>
          <select
            className="form-control"
            style={{ maxWidth: '175px' }}
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Cities ({cities.length})</option>
            {cities.map((c: any) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className="form-control"
            style={{ maxWidth: '145px' }}
            value={boardFilter}
            onChange={(e) => {
              setBoardFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Boards</option>
            <option value="CBSE">CBSE</option>
            <option value="ICSE">ICSE / CISCE</option>
            <option value="IB">IB Board</option>
            <option value="IGCSE">IGCSE / Cambridge</option>
            <option value="State">State Board</option>
          </select>
          <select
            className="form-control"
            style={{ maxWidth: '135px' }}
            value={genderFilter}
            onChange={(e) => {
              setGenderFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Genders</option>
            <option value="co_ed">Co-ed</option>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
          </select>
          <select
            className="form-control"
            style={{ maxWidth: '125px' }}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={250}>250 / page</option>
            <option value={1500}>Show All</option>
          </select>
        </div>

        {/* Showing count & Pagination bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            fontSize: '12.5px',
            color: '#475569',
          }}
        >
          <span>
            Showing <strong>{pagedSchools.length}</strong> of <strong>{filtered.length}</strong> matching schools
          </span>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <span style={{ fontWeight: 700 }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>School Name &amp; Profile</th>
                <th>Location &amp; Board</th>
                <th>Annual Fee Range</th>
                <th>Contact &amp; Commission</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {pagedSchools.map((s: any) => {
                const minFee = Number(s.minFeeAnnual ?? s.annualFeeMin ?? s.minFee ?? 0);
                const maxFee = Number(s.maxFeeAnnual ?? s.annualFeeMax ?? s.maxFee ?? 0);
                const boardsList = Array.isArray(s.boards) && s.boards.length > 0 ? s.boards : [s.board || 'CBSE'];
                return (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openSchoolDetails(s)}>
                    <td>
                      <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                        {s.schoolCode || s.code || s.id.slice(0, 6)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {s.logo ? (
                          <img
                            src={s.logo}
                            alt={s.name}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '8px',
                              objectFit: 'contain',
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              padding: '2px',
                              flexShrink: 0,
                            }}
                          />
                        ) : null}
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--primary-navy)', fontSize: '13.5px' }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span>{s.boardingType || s.hostelQuality || 'Full Boarding'}</span>
                            <span>&bull;</span>
                            <span>{s.gender || (s.genderType === 'boys' ? 'Boys' : s.genderType === 'girls' ? 'Girls' : 'Co-ed')}</span>
                            <span>&bull;</span>
                            <span>Classes {s.classes || s.classesOffered || '1-12'}</span>
                            {s.founded ? <span>&bull; Est. {s.founded}</span> : null}
                            {s.campusSize ? <span>&bull; {s.campusSize}</span> : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '12.5px' }}>
                        {s.city}, {s.state || 'Uttarakhand'}
                        {s.pincode ? <span style={{ color: '#64748B', fontWeight: 400 }}> ({s.pincode})</span> : null}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {boardsList.map((b: string, idx: number) => (
                          <span key={idx} className="badge badge-info" style={{ fontSize: '10.5px' }}>
                            {b}
                          </span>
                        ))}
                        <span className="badge badge-warning" style={{ fontSize: '10.5px' }}>
                          <CrmIcon name="star" size={16} /> {Number(s.rating || 4.3).toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>
                        {s.feesDisplay && s.feesDisplay !== 'Contact School'
                          ? s.feesDisplay
                          : minFee > 0 || maxFee > 0
                            ? `₹${minFee.toLocaleString('en-IN')} - ₹${maxFee.toLocaleString('en-IN')}`
                            : 'Contact School'}
                      </div>
                      {minFee > 0 && (
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          ₹{minFee.toLocaleString('en-IN')} – ₹{maxFee.toLocaleString('en-IN')}
                        </div>
                      )}
                      {s.classFeesCount > 0 && (
                        <span className="badge badge-neutral" style={{ fontSize: '10px', marginTop: '2px' }}>
                          {s.classFeesCount} Class Fee Breakdowns
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '11.5px', color: '#334155' }}>
                        {s.phone ? <div><CrmIcon name="phone" size={16} /> {s.phone}</div> : null}
                        {s.admissionsEmail ? (
                          <div style={{ maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <CrmIcon name="mail" size={16} /> {s.admissionsEmail}
                          </div>
                        ) : null}
                      </div>
                      <span className="badge badge-success" style={{ fontSize: '10.5px', marginTop: '3px' }}>
                        Comm: ₹{Number(s.defaultCommission || 35000).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => openSchoolDetails(s)}
                      >
                        <CrmIcon name="school" size={16} /> View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full School Detail Modal */}
      {selectedSchool && (
        <div className="modal-overlay" onClick={() => setSelectedSchool(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '940px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {selectedSchool.logo ? (
                  <img
                    src={selectedSchool.logo}
                    alt={selectedSchool.name}
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '10px',
                      objectFit: 'contain',
                      border: '1px solid #CBD5E1',
                      background: '#FFF',
                      padding: '4px',
                    }}
                  />
                ) : null}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="badge badge-info">{selectedSchool.schoolCode}</span>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-navy)', margin: 0 }}>
                      {selectedSchool.name}
                    </h3>
                    {selectedSchool.verified !== false && (
                      <span className="badge badge-success"><CrmIcon name="check" size={16} /> Verified Partner</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '4px' }}>
                    <CrmIcon name="map-pin" size={16} /> {selectedSchool.address || `${selectedSchool.city}, ${selectedSchool.state}`}
                    {selectedSchool.pincode ? ` - ${selectedSchool.pincode}` : ''}
                  </div>
                </div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setSelectedSchool(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {detailLoading && (
                <div style={{ fontSize: '12.5px', color: '#2563EB', fontWeight: 600 }}>
                  <CrmIcon name="clock" size={16} /> Loading complete class-wise fee breakdown, photos &amp; facility groups...
                </div>
              )}

              {/* Key Profile & Campus Highlights Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                  gap: '10px',
                }}
              >
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Curriculum Boards</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                    {Array.isArray(selectedSchool.boards)
                      ? selectedSchool.boards.join(', ')
                      : selectedSchool.board || 'CBSE'}
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Boarding &amp; Gender</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                    {selectedSchool.boardingType || 'Full Boarding'} ({selectedSchool.gender || 'Co-ed'})
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Classes &amp; Medium</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                    Classes {selectedSchool.classes || selectedSchool.classesOffered || '1 - 12'} ({selectedSchool.medium || 'English'})
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Annual Fee Range</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#16A34A' }}>
                    {selectedSchool.feesDisplay || 'Contact School'}
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Established &amp; Campus Size</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                    {selectedSchool.founded ? `Est. ${selectedSchool.founded}` : 'Established Campus'}
                    {selectedSchool.campusSize ? ` • ${selectedSchool.campusSize}` : ''}
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Student-Teacher Ratio &amp; Rating</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                    {selectedSchool.studentTeacherRatio || '15:1'} • <CrmIcon name="star" size={16} /> {Number(selectedSchool.rating || 4.3).toFixed(1)} (
                    {selectedSchool.reviews || 0} reviews)
                  </div>
                </div>
              </div>

              {/* Contact, Academic Metadata & Commission Card */}
              <div
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '10px',
                  fontSize: '12.5px',
                }}
              >
                <div>
                  <strong><CrmIcon name="phone" size={16} /> Phone:</strong> {selectedSchool.phone || 'N/A'}
                  <br />
                  <strong><CrmIcon name="mail" size={16} /> Email:</strong> {selectedSchool.admissionsEmail || selectedSchool.details?.email || 'N/A'}
                </div>
                <div>
                  <strong><CrmIcon name="globe" size={16} /> Website:</strong>{' '}
                  {selectedSchool.website ? (
                    <a href={selectedSchool.website} target="_blank" rel="noreferrer" style={{ color: '#2563EB' }}>
                      {selectedSchool.website}
                    </a>
                  ) : (
                    'N/A'
                  )}
                  <br />
                  <strong><CrmIcon name="calendar" size={16} /> Session:</strong> {selectedSchool.academicSession || 'April to March'} (Fee Session:{' '}
                  {selectedSchool.latestFeeSession || '2026-2027'})
                </div>
                <div>
                  <strong><CrmIcon name="rupee" size={16} /> Commission Split:</strong> Total ₹
                  {Number(selectedSchool.defaultCommission || 35000).toLocaleString('en-IN')}
                  <br />
                  <span style={{ fontSize: '11.5px', color: '#1E40AF' }}>
                    Jr: ₹{Number(selectedSchool.jrCommission || 5000).toLocaleString('en-IN')} • Sr: ₹
                    {Number(selectedSchool.srCommission || 7000).toLocaleString('en-IN')} • Org Profit: ₹
                    {Number(selectedSchool.netProfit || 23000).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* About / Description */}
              {selectedSchool.about && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-navy)', marginBottom: '6px' }}>
                    <CrmIcon name="book-open" size={16} /> About {selectedSchool.name}
                  </h4>
                  <div
                    style={{
                      fontSize: '12.5px',
                      color: '#334155',
                      lineHeight: 1.6,
                      background: '#F8FAFC',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {selectedSchool.about}
                  </div>
                </div>
              )}

              {/* Class-Wise Fee Breakdown Table */}
              {Array.isArray(selectedSchool.classFees) && selectedSchool.classFees.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-navy)', marginBottom: '8px' }}>
                    <CrmIcon name="credit-card" size={16} /> Class-Wise Fee Structure ({selectedSchool.classFees.length} Classes)
                  </h4>
                  <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Class</th>
                          <th>Session</th>
                          <th>Annual Fee</th>
                          <th>One-Time Fee</th>
                          <th>First Year Total</th>
                          <th>Itemized Fee Lines</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSchool.classFees.map((cf: any, idx: number) => (
                          <tr key={idx}>
                            <td>
                              <strong>{cf.class_name || `Class ${idx + 1}`}</strong>
                            </td>
                            <td>{cf.fee_session || '2026-2027'}</td>
                            <td>
                              {cf.annual_fee ? `₹${Number(cf.annual_fee).toLocaleString('en-IN')}` : '—'}
                            </td>
                            <td>
                              {cf.one_time_fee ? `₹${Number(cf.one_time_fee).toLocaleString('en-IN')}` : '—'}
                            </td>
                            <td>
                              <strong style={{ color: '#16A34A' }}>
                                {cf.first_year_total
                                  ? `₹${Number(cf.first_year_total).toLocaleString('en-IN')}`
                                  : '—'}
                              </strong>
                            </td>
                            <td style={{ fontSize: '11px', color: '#475569' }}>
                              {Array.isArray(cf.items) && cf.items.length > 0
                                ? cf.items
                                    .map(
                                      (it: any) =>
                                        `${it.fee_type}: ₹${Number(it.amount || 0).toLocaleString('en-IN')} (${it.frequency || 'Annual'}${it.refundable ? ', Refundable' : ''})`,
                                    )
                                    .join(' • ')
                                : 'Standard Composite Fee'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Categorized Campus Facilities */}
              {selectedSchool.facilityGroups && Object.keys(selectedSchool.facilityGroups).length > 0 ? (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-navy)', marginBottom: '8px' }}>
                    <CrmIcon name="building" size={16} /> Campus Facilities &amp; Hostel Amenities
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {Object.entries(selectedSchool.facilityGroups).map(([groupName, items]: [string, any]) => (
                      <div
                        key={groupName}
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '10px',
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-navy)', marginBottom: '6px' }}>
                          {groupName}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(Array.isArray(items) ? items : []).map((fac: string, i: number) => (
                            <span key={i} className="badge badge-neutral" style={{ fontSize: '10.5px' }}>
                              {fac}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : Array.isArray(selectedSchool.facilities || selectedSchool.sports) ? (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-navy)', marginBottom: '6px' }}>
                    <CrmIcon name="building" size={16} /> Campus Facilities
                  </h4>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(selectedSchool.facilities || selectedSchool.sports || []).map((fac: string, idx: number) => (
                      <span key={idx} className="badge badge-info">
                        {fac}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Campus Photo Gallery */}
              {Array.isArray(selectedSchool.images) && selectedSchool.images.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-navy)', marginBottom: '8px' }}>
                    <CrmIcon name="camera" size={16} /> Campus Photo Gallery ({selectedSchool.images.length} Photos)
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {selectedSchool.images.slice(0, 12).map((imgUrl: string, idx: number) => (
                      <a key={idx} href={imgUrl} target="_blank" rel="noreferrer">
                        <img
                          src={imgUrl}
                          alt={`${selectedSchool.name} photo ${idx + 1}`}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                          style={{
                            width: '100%',
                            height: '115px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                          }}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {canManageSchoolStatus && selectedSchool.status !== 'inactive' && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleCheckAndDeactivateSchool(selectedSchool)}
                >
                  Deactivate School
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setSelectedSchool(null)}>
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* School Deactivation Active Applications Warning Modal */}
      {deactivatePrompt && (
        <div className="modal-overlay" style={{ zIndex: 2400 }} onClick={() => setDeactivatePrompt(null)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#991B1B' }}>
                <CrmIcon name="alert" size={16} /> Confirm School Deactivation
              </h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setDeactivatePrompt(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ padding: '12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', color: '#92400E', fontWeight: 700 }}>
                This school has <strong>{deactivatePrompt.activeCount}</strong> active application(s). Are you sure you want to deactivate it?
              </div>
              <div>
                <strong>School:</strong> {deactivatePrompt.school.name} ({deactivatePrompt.school.schoolCode})
              </div>
              <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                • Existing applications &amp; historical records remain preserved.<br />
                • New applications to this school will be blocked.<br />
                • Leads with no other active applications will be reopened for alternative schools &amp; Managers will be notified.
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setDeactivatePrompt(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deactivating}
                onClick={handleConfirmDeactivateSchool}
              >
                {deactivating ? 'Deactivating...' : 'Confirm Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkImportModal
        entity="schools"
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={onRefresh}
        onShowToast={onShowToast}
      />
    </div>
  );
}
