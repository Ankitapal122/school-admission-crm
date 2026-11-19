import React, { useState, useEffect } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall } from '../../lib/api';

interface TourItem {
  id: string;
  leadId: string;
  schoolId?: string | null;
  schoolName?: string | null;
  tourType: 'ONLINE_ZOOM' | 'VISIT_PHYSICAL';
  scheduledAt: string;
  zoomMeetingUrl?: string | null;
  status: string;
  reminder10mSent?: boolean;
  managerAlert5mSent?: boolean;
  proceedAdmission?: boolean | null;
  postTourFeedback?: string | null;
  lead?: {
    id: string;
    leadNumber: string;
    studentName: string;
    parentName: string;
    parentPhone: string;
    city?: string;
    budgetMax?: number;
  };
  school?: {
    id: string;
    name: string;
    city?: string;
    feesDisplay?: string;
  };
}

export function VirtualTourManager({
  leads = [],
  schools = [],
  onRefresh,
  onShowToast,
}: {
  leads?: any[];
  schools?: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [tours, setTours] = useState<TourItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'ONLINE_ZOOM' | 'VISIT_PHYSICAL'>('ALL');

  // Schedule modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newLeadId, setNewLeadId] = useState('');
  const [newSchoolId, setNewSchoolId] = useState('');
  const [newTourType, setNewTourType] = useState<'ONLINE_ZOOM' | 'VISIT_PHYSICAL'>('ONLINE_ZOOM');
  const [newScheduledAt, setNewScheduledAt] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 16)
  );
  const [newZoomUrl, setNewZoomUrl] = useState('https://zoom.us/j/8492041924?pwd=boardingedu');
  const [scheduling, setScheduling] = useState(false);

  // Post-Tour Feedback Modal
  const [completingTour, setCompletingTour] = useState<TourItem | null>(null);
  const [proceedDecision, setProceedDecision] = useState<'YES' | 'NO'>('YES');
  const [postFeedback, setPostFeedback] = useState('');
  const [agreedFeeVal, setAgreedFeeVal] = useState('450000');
  const [savingFeedback, setSavingFeedback] = useState(false);

  const fetchTours = async () => {
    setLoading(true);
    try {
      const res = await apiCall('/applications/tours/upcoming');
      const list = Array.isArray(res) ? res : res?.data || [];
      setTours(list);
    } catch (err: any) {
      // quiet fail or toast
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTours();
  }, []);

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadId) {
      onShowToast('Please select a student lead.', 'warning');
      return;
    }
    setScheduling(true);
    try {
      const selectedSchool = schools.find((s) => s.id === newSchoolId);
      await apiCall('/applications/tours/schedule', 'POST', {
        leadId: newLeadId,
        schoolId: newSchoolId || undefined,
        schoolName: selectedSchool?.name || undefined,
        tourType: newTourType,
        scheduledAt: new Date(newScheduledAt).toISOString(),
        zoomMeetingUrl: newTourType === 'ONLINE_ZOOM' ? newZoomUrl : undefined,
      });
      onShowToast(
        `${newTourType === 'ONLINE_ZOOM' ? 'Virtual Zoom Tour' : 'Campus Visit'} scheduled! Parent & Manager notified.`,
        'success'
      );
      setShowScheduleModal(false);
      fetchTours();
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to schedule tour.', 'danger');
    } finally {
      setScheduling(false);
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTour) return;
    setSavingFeedback(true);
    try {
      await apiCall(`/applications/tours/${completingTour.id}/complete`, 'POST', {
        proceedAdmission: proceedDecision === 'YES',
        feedback: postFeedback.trim(),
        totalFee: Number(agreedFeeVal || 450000),
      });
      onShowToast(
        proceedDecision === 'YES'
          ? 'Tour completed! Admission confirmed & 3-Tier Milestone Fee Installment plan generated.'
          : 'Tour marked as completed (Not proceeding with admission).',
        'success'
      );
      setCompletingTour(null);
      setPostFeedback('');
      fetchTours();
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to complete tour.', 'danger');
    } finally {
      setSavingFeedback(false);
    }
  };

  const getTimeBadge = (isoDate: string) => {
    const diff = new Date(isoDate).getTime() - Date.now();
    const diffMins = Math.round(diff / 60000);
    if (diffMins < 0) {
      return { text: 'Past Tour', color: '#64748B', bg: '#F1F5F9' };
    }
    if (diffMins <= 15) {
      return { text: `🚨 In ${diffMins} mins!`, color: '#DC2626', bg: '#FEE2E2' };
    }
    if (diffMins <= 60) {
      return { text: `⏰ In ${diffMins} mins`, color: '#D97706', bg: '#FEF3C7' };
    }
    if (diffMins <= 1440) {
      const hrs = Math.round(diffMins / 60);
      return { text: `📅 In ${hrs} hours`, color: '#2563EB', bg: '#EFF6FF' };
    }
    const days = Math.round(diffMins / 1440);
    return { text: `📅 In ${days} days`, color: '#475569', bg: '#F8FAFC' };
  };

  const filteredTours = tours.filter((t) => {
    if (filterType === 'ALL') return true;
    return t.tourType === filterType;
  });

  return (
    <div>
      {/* Header action strip */}
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn btn-sm ${filterType === 'ALL' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilterType('ALL')}
          >
            All Tours ({tours.length})
          </button>
          <button
            className={`btn btn-sm ${filterType === 'ONLINE_ZOOM' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilterType('ONLINE_ZOOM')}
          >
            🎥 Online Zoom ({tours.filter((t) => t.tourType === 'ONLINE_ZOOM').length})
          </button>
          <button
            className={`btn btn-sm ${filterType === 'VISIT_PHYSICAL' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilterType('VISIT_PHYSICAL')}
          >
            🏫 Campus Visits ({tours.filter((t) => t.tourType === 'VISIT_PHYSICAL').length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-sm btn-outline" onClick={fetchTours} disabled={loading}>
            <CrmIcon name="refresh-cw" size={14} /> Refresh
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setShowScheduleModal(true)}>
            <CrmIcon name="calendar" size={14} /> Schedule New Tour / Visit
          </button>
        </div>
      </div>

      {/* Info notice about WhatsApp Bot automation */}
      <div
        style={{
          background: 'linear-gradient(90deg, #EFF6FF 0%, #F0FDF4 100%)',
          border: '1px solid #BFDBFE',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '12.5px',
          color: '#1E3A8A',
        }}
      >
        <div style={{ fontSize: '20px' }}>🤖</div>
        <div>
          <strong>Automated Bot Reminders Active:</strong> Parents receive an automatic WhatsApp reminder with their direct Zoom link <strong>10 minutes prior</strong> to the tour. Managers &amp; Counsellors receive an urgent alert <strong>5 minutes prior</strong>.
        </div>
      </div>

      {/* Tours Grid */}
      {filteredTours.length === 0 ? (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px dashed #CBD5E1',
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748B',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎥</div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#1E293B', marginBottom: '4px' }}>
            No Virtual Tours Scheduled
          </div>
          <p style={{ fontSize: '13px', maxWidth: '420px', margin: '0 auto 16px' }}>
            When parents request school details on WhatsApp and select &quot;Online Tour&quot;, or when staff schedules a visit, they will automatically appear here.
          </p>
          <button className="btn btn-sm btn-primary" onClick={() => setShowScheduleModal(true)}>
            Schedule First Tour
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredTours.map((tour) => {
            const timeBadge = getTimeBadge(tour.scheduledAt);
            const isCompleted = tour.status === 'COMPLETED';
            const isZoom = tour.tourType === 'ONLINE_ZOOM';

            return (
              <div
                key={tour.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: isCompleted
                    ? '1px solid #E2E8F0'
                    : '1px solid #BFDBFE',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Top strip */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      background: isZoom ? '#EFF6FF' : '#FEF3C7',
                      color: isZoom ? '#1D4ED8' : '#B45309',
                      fontWeight: 700,
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {isZoom ? '🎥 Online Live Zoom Tour' : '🏫 Physical Campus Visit'}
                  </span>
                  <span
                    style={{
                      background: timeBadge.bg,
                      color: timeBadge.color,
                      fontWeight: 700,
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    {timeBadge.text}
                  </span>
                </div>

                {/* Student & School Info */}
                <div>
                  <h4
                    style={{
                      margin: '0 0 2px 0',
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#0F172A',
                    }}
                  >
                    {tour.lead?.studentName || 'Student'}
                  </h4>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    Parent: <strong>{tour.lead?.parentName || 'Parent'}</strong> ({tour.lead?.parentPhone || 'Phone N/A'})
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#1D4ED8',
                      fontWeight: 600,
                      marginTop: '4px',
                    }}
                  >
                    🏫 {tour.schoolName || tour.school?.name || 'Boarding School'}
                  </div>
                </div>

                {/* Schedule & Link box */}
                <div
                  style={{
                    background: '#F8FAFC',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: '#64748B' }}>Scheduled For:</span>
                    <strong style={{ color: '#0F172A' }}>
                      {new Date(tour.scheduledAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                  </div>
                  {isZoom && tour.zoomMeetingUrl && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '6px',
                        paddingTop: '6px',
                        borderTop: '1px dashed #E2E8F0',
                      }}
                    >
                      <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>Zoom Link:</span>
                      <a
                        href={tour.zoomMeetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: '#2563EB',
                          textDecoration: 'none',
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '200px',
                        }}
                      >
                        {tour.zoomMeetingUrl}
                      </a>
                    </div>
                  )}
                </div>

                {/* Status & Feedback if completed */}
                {isCompleted && (
                  <div
                    style={{
                      background: tour.proceedAdmission ? '#F0FDF4' : '#FEF2F2',
                      border: tour.proceedAdmission ? '1px solid #BBF7D0' : '1px solid #FECACA',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        color: tour.proceedAdmission ? '#166534' : '#991B1B',
                        marginBottom: '2px',
                      }}
                    >
                      {tour.proceedAdmission
                        ? '✅ Admission Decision: PROCEED TO ADMISSION'
                        : '❌ Admission Decision: NOT PROCEEDING'}
                    </div>
                    {tour.postTourFeedback && (
                      <div style={{ color: '#475569', fontStyle: 'italic' }}>
                        &quot;{tour.postTourFeedback}&quot;
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '4px' }}>
                  {isZoom && tour.zoomMeetingUrl && (
                    <a
                      href={tour.zoomMeetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-primary"
                      style={{
                        flex: 1,
                        textDecoration: 'none',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: '#2563EB',
                      }}
                    >
                      <CrmIcon name="video" size={14} /> Join Zoom via CRM
                    </a>
                  )}

                  {!isCompleted && (
                    <button
                      className="btn btn-sm btn-success"
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      onClick={() => {
                        setCompletingTour(tour);
                        setProceedDecision('YES');
                        setPostFeedback('');
                        setAgreedFeeVal(String(tour.lead?.budgetMax || 450000));
                      }}
                    >
                      <CrmIcon name="check-circle" size={14} /> Complete Tour &amp; Decision
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Tour Modal */}
      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  <CrmIcon name="calendar" size={16} /> Schedule Virtual Tour or Campus Visit
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Parent will receive instant confirmation &amp; reminder on WhatsApp
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setShowScheduleModal(false)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Select Student Lead *</label>
                  <select
                    className="form-control"
                    required
                    value={newLeadId}
                    onChange={(e) => setNewLeadId(e.target.value)}
                  >
                    <option value="">-- Select Student / Lead --</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.studentName} (Parent: {l.parentName || 'Parent'} - {l.fatherPhone || l.mobile})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Select Partner School *</label>
                  <select
                    className="form-control"
                    value={newSchoolId}
                    onChange={(e) => setNewSchoolId(e.target.value)}
                  >
                    <option value="">-- General / To Be Decided --</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Tour Type *</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${newTourType === 'ONLINE_ZOOM' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ flex: 1 }}
                      onClick={() => setNewTourType('ONLINE_ZOOM')}
                    >
                      🎥 Online Live Zoom Tour
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${newTourType === 'VISIT_PHYSICAL' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ flex: 1 }}
                      onClick={() => setNewTourType('VISIT_PHYSICAL')}
                    >
                      🏫 Physical Campus Visit
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Scheduled Date &amp; Time *</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    required
                    value={newScheduledAt}
                    onChange={(e) => setNewScheduledAt(e.target.value)}
                  />
                </div>

                {newTourType === 'ONLINE_ZOOM' && (
                  <div className="form-group">
                    <label className="form-label">Zoom Meeting Link *</label>
                    <input
                      type="url"
                      className="form-control"
                      required
                      value={newZoomUrl}
                      onChange={(e) => setNewZoomUrl(e.target.value)}
                      placeholder="https://zoom.us/j/..."
                    />
                    <small style={{ color: '#64748B', fontSize: '11px' }}>
                      This Zoom link will be automatically sent to the parent 10 minutes before the tour starts.
                    </small>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowScheduleModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={scheduling} className="btn btn-primary">
                  {scheduling ? 'Scheduling...' : 'Confirm & Schedule Tour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post-Tour Feedback & Admission Proceed Modal */}
      {completingTour && (
        <div className="modal-overlay" onClick={() => setCompletingTour(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  <CrmIcon name="check-circle" size={16} /> Post-Tour Feedback &amp; Admission Decision
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Tour for <strong>{completingTour.lead?.studentName}</strong> ({completingTour.schoolName || 'School'})
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setCompletingTour(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleCompleteSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px',
                  }}
                >
                  <label
                    className="form-label"
                    style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}
                  >
                    Proceed with admission? *
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      className={`btn ${proceedDecision === 'YES' ? 'btn-success' : 'btn-outline'}`}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '14px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      onClick={() => setProceedDecision('YES')}
                    >
                      <CrmIcon name="check" size={18} /> Yes, Proceed with Admission
                    </button>
                    <button
                      type="button"
                      className={`btn ${proceedDecision === 'NO' ? 'btn-danger' : 'btn-outline'}`}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '14px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      onClick={() => setProceedDecision('NO')}
                    >
                      <CrmIcon name="x" size={18} /> No, Not Proceeding
                    </button>
                  </div>
                </div>

                {proceedDecision === 'YES' && (
                  <div
                    style={{
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: '10px',
                      padding: '14px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#166534', fontSize: '13px', marginBottom: '8px' }}>
                      ⚡ 3-Tier Milestone Fee Installment Plan will be Auto-Created:
                    </div>
                    <ul style={{ margin: '0 0 12px 18px', padding: 0, fontSize: '12px', color: '#166534' }}>
                      <li><strong>Milestone 1: 30%</strong> Token / Admission Confirmation (Immediate)</li>
                      <li><strong>Milestone 2: 50%</strong> 2nd Term Fee (After 2 Months)</li>
                      <li><strong>Milestone 3: 20%</strong> Final Clearance (Month 4)</li>
                    </ul>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ color: '#166534' }}>Agreed Annual Fee (₹) *</label>
                      <input
                        type="number"
                        className="form-control"
                        required
                        value={agreedFeeVal}
                        onChange={(e) => setAgreedFeeVal(e.target.value)}
                        placeholder="450000"
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Post-Tour Parent Feedback &amp; Observations *</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    required
                    placeholder="Parent liked the campus facilities, hostel food, agreed on payment schedule..."
                    value={postFeedback}
                    onChange={(e) => setPostFeedback(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCompletingTour(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFeedback}
                  className={`btn ${proceedDecision === 'YES' ? 'btn-success' : 'btn-primary'}`}
                >
                  {savingFeedback ? 'Saving...' : 'Save Decision & Close Tour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
