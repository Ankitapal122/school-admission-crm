import React, { useEffect, useState } from 'react';
import { apiCall, downloadApiFile } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { hasRole } from '../../lib/roles';

export function CommissionsView({
  commissions = [],
  onRefresh,
  onShowToast,
}: {
  commissions: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const { user } = useAuthStore();
  const [summary, setSummary] = useState<any>(null);
  const [schoolBreakdown, setSchoolBreakdown] = useState<any[]>([]);
  const [showSchoolSummary, setShowSchoolSummary] = useState(false);

  const [actionModal, setActionModal] = useState<{
    commission: any;
    type: 'receive' | 'payout' | 'reverse' | 'adjust';
  } | null>(null);
  const [utrRef, setUtrRef] = useState('');
  const [bankName, setBankName] = useState('HDFC Bank');
  const [reasonText, setReasonText] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiCall('/commissions/summary')
      .then((res) => setSummary(res?.data || res))
      .catch(() => {});
    apiCall('/commissions/school-wise')
      .then((res) => {
        const list = res?.data || res?.schools || res;
        setSchoolBreakdown(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, [commissions]);

  const handleSubmitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;
    const { commission, type } = actionModal;
    setBusy(true);
    try {
      if (type === 'receive') {
        await apiCall(`/commissions/${commission.id}/receive`, 'POST', {
          utrReference: utrRef.trim() || `UTR-${Date.now().toString().slice(-6)}`,
          bankName: bankName.trim() || 'HDFC Bank',
        });
        onShowToast('Commission marked as RECEIVED from school!', 'success');
      } else if (type === 'payout') {
        await apiCall(`/commissions/${commission.id}/payout`, 'POST', {
          utrReference: utrRef.trim() || `PAY-${Date.now().toString().slice(-6)}`,
          paymentMode: 'NEFT/RTGS/IMPS',
        });
        onShowToast('Payout released to Counsellor/Manager (90d FNF tracked)!', 'success');
      } else if (type === 'reverse') {
        if (reasonText.trim().length < 5) {
          onShowToast('Reversal reason must be at least 5 characters.', 'warning');
          setBusy(false);
          return;
        }
        const res = await apiCall(`/commissions/${commission.id}/reverse`, 'POST', {
          reason: reasonText.trim(),
        });
        const adj = res?.adjustmentEntry || res?.data?.adjustmentEntry;
        onShowToast(
          adj?.id
            ? 'Paid commission reversed cleanly — negative adjustment entry created.'
            : 'Commission reversed & audited.',
          'warning'
        );
      } else if (type === 'adjust') {
        await apiCall(`/commissions/${commission.id}/adjust`, 'POST', {
          amount: Number(adjustAmount || 0),
          reason: reasonText.trim() || 'Manual finance adjustment',
        });
        onShowToast('Commission adjustment posted to ledger.', 'success');
      }
      setActionModal(null);
      setUtrRef('');
      setReasonText('');
      setAdjustAmount('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Commission operation failed.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (c: any) => {
    try {
      await apiCall(`/commissions/${c.id}/approve`, 'PATCH', {});
      onShowToast('Commission approved for payout.', 'success');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Approval failed.', 'danger');
    }
  };

  return (
    <div>
      {/* GST & TDS Summary Strip */}
      <div className="stats-grid" style={{ marginBottom: '18px' }}>
        <div className="stat-card blue">
          <div className="stat-card-top">
            <span className="stat-label">Gross Receivable</span>
            <div className="stat-icon">💰</div>
          </div>
          <div className="stat-value">
            ₹{Number(summary?.totalCompanyGross ?? 0).toLocaleString('en-IN')}
          </div>
          <div className="stat-trend">Triggered at Sub-Stage C Only</div>
        </div>

        <div className="stat-card green">
          <div className="stat-card-top">
            <span className="stat-label">Net Company Profit</span>
            <div className="stat-icon">📈</div>
          </div>
          <div className="stat-value">
            ₹{Number(summary?.netCompanyProfit ?? 0).toLocaleString('en-IN')}
          </div>
          <div className="stat-trend">
            Jr + Sr Payouts: ₹
            {(Number(summary?.totalJrPayouts ?? 0) + Number(summary?.totalSrPayouts ?? 0)).toLocaleString('en-IN')}
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-card-top">
            <span className="stat-label">GST ({summary?.taxSummary?.gstRate ?? 18}%) &amp; TDS ({summary?.taxSummary?.tdsRate ?? 10}%)</span>
            <div className="stat-icon">🧾</div>
          </div>
          <div className="stat-value">
            ₹{Number(summary?.taxSummary?.gstEstimated ?? 0).toLocaleString('en-IN')}
          </div>
          <div className="stat-trend">
            TDS Est: ₹{Number(summary?.taxSummary?.tdsEstimated ?? 0).toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">💰 Commission Ledger, GST/TDS &amp; Reversal Engine</h3>
            <span className="card-subtitle">
              Immutable ledger entries created ONLY at Sub-Stage C (Formalities Done), with UTR tracking &amp; 90-day FNF reversals
            </span>
          </div>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setShowSchoolSummary((s) => !s)}
          >
            {showSchoolSummary ? 'Show Full Ledger' : '🏫 School-wise Breakdown'}
          </button>
        </div>

        {showSchoolSummary ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Admissions</th>
                  <th>Total Gross</th>
                  <th>Jr Share</th>
                  <th>Sr Share</th>
                  <th>Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {schoolBreakdown.map((s, i) => (
                  <tr key={s.schoolId || i}>
                    <td>
                      <strong>{s.schoolName}</strong> ({s.city})
                    </td>
                    <td>{s.totalAdmissions}</td>
                    <td>₹{Number(s.totalCompanyAmount || 0).toLocaleString('en-IN')}</td>
                    <td>₹{Number(s.totalJrAmount || 0).toLocaleString('en-IN')}</td>
                    <td>₹{Number(s.totalSrAmount || 0).toLocaleString('en-IN')}</td>
                    <td>
                      <strong>₹{Number(s.netProfit || 0).toLocaleString('en-IN')}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code / Ref</th>
                  <th>Student &amp; School</th>
                  <th>Amount (Gross / Split)</th>
                  <th>Status &amp; FNF</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#64748B', padding: '24px' }}>
                      No commissions generated yet. Advance an application to Sub-Stage C.
                    </td>
                  </tr>
                ) : (
                  commissions.map((c: any) => {
                    const isNeg = Number(c.amount) < 0 || c.isReversal;
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.commissionCode || c.id.slice(0, 8)}</strong>
                          {isNeg && (
                            <div>
                              <span className="badge badge-danger">Negative Adjustment</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <div>
                            <strong>{c.lead?.studentName || c.studentName || 'Student'}</strong>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                            {c.school?.name || c.schoolName || 'Partner School'}
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: isNeg ? '#DC2626' : '#0F172A' }}>
                            ₹{Number(c.amount || 0).toLocaleString('en-IN')}
                          </strong>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            Jr: ₹{Number(c.jrAmount || 0).toLocaleString('en-IN')} &bull; Sr: ₹
                            {Number(c.srAmount || 0).toLocaleString('en-IN')}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              c.status === 'paid_out' || c.status === 'PAID'
                                ? 'badge-success'
                                : c.status === 'reversed' || c.status === 'REVERSED'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {c.status}
                          </span>
                          {c.fnfSettled && (
                            <span className="badge badge-info" style={{ marginLeft: '4px' }}>
                              FNF 90d
                            </span>
                          )}
                        </td>
                        <td>
                          {hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER') && !isNeg && (
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                              {c.status === 'pending' && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => setActionModal({ commission: c, type: 'receive' })}
                                >
                                  🏦 Receive
                                </button>
                              )}
                              {['received', 'PENDING', 'PENDING_APPROVAL'].includes(c.status) && (
                                <button
                                  className="btn btn-sm btn-outline"
                                  onClick={() => handleApprove(c)}
                                >
                                  ✓ Approve
                                </button>
                              )}
                              {['received', 'APPROVED', 'PAYABLE'].includes(c.status) && (
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => setActionModal({ commission: c, type: 'payout' })}
                                >
                                  💸 Payout
                                </button>
                              )}
                              {hasRole(user?.role, 'SUPER_ADMIN') &&
                                !['reversed', 'REVERSED'].includes(c.status) && (
                                  <>
                                    <button
                                      className="btn btn-sm btn-danger"
                                      onClick={() =>
                                        setActionModal({ commission: c, type: 'reverse' })
                                      }
                                    >
                                      ↩ Reverse
                                    </button>
                                    <button
                                      className="btn btn-sm btn-outline"
                                      onClick={() =>
                                        setActionModal({ commission: c, type: 'adjust' })
                                      }
                                    >
                                      ± Adjust
                                    </button>
                                  </>
                                )}
                            </div>
                          )}
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

      {/* Styled Finance Action Modal */}
      {actionModal && (
        <div className="modal-overlay" onClick={() => setActionModal(null)}>
          <div className="modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary-navy)' }}>
                {actionModal.type === 'receive' && '🏦 Receive School Payment (UTR)'}
                {actionModal.type === 'payout' && '💸 Release Counsellor Payout'}
                {actionModal.type === 'reverse' && '↩ Reverse Commission Entry'}
                {actionModal.type === 'adjust' && '± Create Ledger Adjustment'}
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setActionModal(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitAction}>
              <div className="modal-body">
                {(actionModal.type === 'receive' || actionModal.type === 'payout') && (
                  <>
                    <div className="form-group">
                      <label className="form-label">UTR / Bank Reference *</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="UTR123456789"
                        value={utrRef}
                        onChange={(e) => setUtrRef(e.target.value)}
                      />
                    </div>
                    {actionModal.type === 'receive' && (
                      <div className="form-group">
                        <label className="form-label">Receiving Bank</label>
                        <input
                          type="text"
                          className="form-control"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}
                {actionModal.type === 'adjust' && (
                  <div className="form-group">
                    <label className="form-label">Adjustment Amount (₹, negative or positive) *</label>
                    <input
                      type="number"
                      className="form-control"
                      required
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                    />
                  </div>
                )}
                {(actionModal.type === 'reverse' || actionModal.type === 'adjust') && (
                  <div className="form-group">
                    <label className="form-label">Mandatory Audit Reason (min 5 chars) *</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      required
                      placeholder="Parent withdrew admission before term start..."
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setActionModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Posting...' : 'Confirm Transaction'}
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
  onRefresh,
  onShowToast,
}: {
  admissions: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const handleSubStage = async (app: any, subStage: string) => {
    try {
      const res = await apiCall(`/applications/${app.id}/sub-stage`, 'PUT', {
        sub_stage: subStage,
        annualFee: Number(app.confirmedRevenue || 500000),
      });
      const comm = res?.commission || res?.data?.commission;
      onShowToast(
        subStage === 'C_formalities_done' && comm?.id
          ? 'Sub-Stage C verified! Commission ledger entry generated.'
          : `Application updated to ${subStage}.`,
        'success'
      );
      onRefresh();
    } catch (err: any) {
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
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">🎓 Multi-School Applications &amp; Admission Tracking</h3>
          <span className="card-subtitle">
            Strict Commission Rule: Commission ONLY triggers at Sub-Stage C (Formalities Done)
          </span>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>App Ref</th>
              <th>Student &amp; School</th>
              <th>Fee (₹)</th>
              <th>Sub-Stage &amp; Milestones</th>
              <th>Receipt &amp; Actions</th>
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
              admissions.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.applicationCode || a.id.slice(0, 8)}</strong>
                    <div style={{ fontSize: '10.5px', color: '#64748B' }}>{a.stage || 'applied'}</div>
                  </td>
                  <td>
                    <div>
                      <strong>{a.lead?.studentName || a.studentName || 'Student'}</strong>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                      {a.school?.name || a.schoolName || 'School'}
                    </div>
                  </td>
                  <td>₹{Number(a.confirmedRevenue || a.annualFee || 0).toLocaleString('en-IN')}</td>
                  <td>
                    <span
                      className={`badge ${
                        a.subStage === 'C_formalities_done' ? 'badge-success' : 'badge-warning'
                      }`}
                    >
                      {a.subStage || 'A_waiting'}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleSubStage(a, 'A_waiting')}
                      >
                        A
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleSubStage(a, 'B_only_registration')}
                      >
                        B
                      </button>
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleSubStage(a, 'C_formalities_done')}
                      >
                        C (Done)
                      </button>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleMilestone(a, 'conference-call', 'Conference Call')}
                      >
                        ☎️ Conf
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleMilestone(a, 'visit', 'Campus Visit')}
                      >
                        🏫 Visit
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleDownloadReceipt(a)}
                      >
                        📄 Receipt PDF
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
            📥 2-Step Bulk {entity === 'leads' ? 'Leads' : 'Schools'} Import (Preview → Confirm)
          </h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            ✕
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
                    ⬇️ Download Error Rows CSV
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
  onRefresh,
  onShowToast,
}: {
  schools: any[];
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
              🏫 Partner Boarding Schools Directory ({schools.length.toLocaleString('en-IN')} Schools across{' '}
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
                📥 Bulk Import Schools
              </button>
            )}
          </div>
        </div>

        {/* Quick State Filter Pills */}
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
          {statesList.slice(0, 12).map(([st, cnt]) => (
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
              <option key={st} value={st}>
                {st} ({cnt})
              </option>
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
              <option key={c} value={c}>
                {c}
              </option>
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
                          ★ {Number(s.rating || 4.3).toFixed(1)}
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
                        {s.phone ? <div>📞 {s.phone}</div> : null}
                        {s.admissionsEmail ? (
                          <div style={{ maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ✉️ {s.admissionsEmail}
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
                        🏛️ View Details
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
                      <span className="badge badge-success">✓ Verified Partner</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '4px' }}>
                    📍 {selectedSchool.address || `${selectedSchool.city}, ${selectedSchool.state}`}
                    {selectedSchool.pincode ? ` - ${selectedSchool.pincode}` : ''}
                  </div>
                </div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setSelectedSchool(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {detailLoading && (
                <div style={{ fontSize: '12.5px', color: '#2563EB', fontWeight: 600 }}>
                  ⏳ Loading complete class-wise fee breakdown, photos &amp; facility groups...
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
                    {selectedSchool.studentTeacherRatio || '15:1'} • ★ {Number(selectedSchool.rating || 4.3).toFixed(1)} (
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
                  <strong>📞 Phone:</strong> {selectedSchool.phone || 'N/A'}
                  <br />
                  <strong>✉️ Email:</strong> {selectedSchool.admissionsEmail || selectedSchool.details?.email || 'N/A'}
                </div>
                <div>
                  <strong>🌐 Website:</strong>{' '}
                  {selectedSchool.website ? (
                    <a href={selectedSchool.website} target="_blank" rel="noreferrer" style={{ color: '#2563EB' }}>
                      {selectedSchool.website}
                    </a>
                  ) : (
                    'N/A'
                  )}
                  <br />
                  <strong>📅 Session:</strong> {selectedSchool.academicSession || 'April to March'} (Fee Session:{' '}
                  {selectedSchool.latestFeeSession || '2026-2027'})
                </div>
                <div>
                  <strong>💰 Commission Split:</strong> Total ₹
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
                    📖 About {selectedSchool.name}
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
                    💳 Class-Wise Fee Structure ({selectedSchool.classFees.length} Classes)
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
                    🏟️ Campus Facilities &amp; Hostel Amenities
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
                    🏟️ Campus Facilities
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
                    📸 Campus Photo Gallery ({selectedSchool.images.length} Photos)
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
              <button className="btn btn-outline" onClick={() => setSelectedSchool(null)}>
                Close Dossier
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
