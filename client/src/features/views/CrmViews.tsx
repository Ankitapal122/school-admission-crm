import React, { useEffect, useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import WhatsAppBotModal from '../../components/WhatsAppBotModal';
import { apiCall } from '../../lib/api';

export { LeadsView, CreateLeadModal } from './LeadsWorkspaceView';
export { CommissionsView, AdmissionsView, SchoolsView, BulkImportModal } from './FinanceAndSchoolsView';
export {
  ReportsView,
  UsersView,
  SettingsView,
  AuthenticatorSetupView,
  SessionsView,
} from './EnterpriseAdminAndReportsView';

export function TeamsView({
  teams = [],
  onRefresh,
  onShowToast,
}: {
  teams: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [region, setRegion] = useState('Uttarakhand');

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiCall('/teams', 'POST', { name: teamName.trim(), region: region.trim() });
      onShowToast('Team created cleanly!', 'success');
      setShowCreate(false);
      setTeamName('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Team creation failed.', 'danger');
    }
  };

  const handleToggleTeam = async (id: string) => {
    try {
      await apiCall(`/teams/${id}/toggle-status`, 'PATCH', {});
      onShowToast('Team status updated.', 'success');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to toggle team.', 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title"><CrmIcon name="users" size={16} /> Team Structure &amp; Hierarchies ({teams.length})</h3>
          <span className="card-subtitle">Manage Counsellor &amp; Manager regional pods</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
          <CrmIcon name="plus" size={16} /> Create Team
        </button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Team Name</th>
              <th>Region</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {teams.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                  No teams configured yet.
                </td>
              </tr>
            ) : (
              teams.map((t: any) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                  </td>
                  <td>{t.region || 'Uttarakhand'}</td>
                  <td>
                    <span className={`badge ${t.isActive !== false ? 'badge-success' : 'badge-warning'}`}>
                      {t.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleToggleTeam(t.id)}
                    >
                      <CrmIcon name="play" size={16} /> Toggle Status
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}><CrmIcon name="plus" size={16} /> Create Regional Team</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowCreate(false)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateTeam}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Team Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Region</label>
                  <input
                    type="text"
                    className="form-control"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function FollowUpsView({
  followUps = [],
  leads = [],
  onRefresh,
  onShowToast,
}: {
  followUps: any[];
  leads: any[];
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [bucket, setBucket] = useState<'all' | 'today' | 'overdue'>('today');
  const [bucketItems, setBucketItems] = useState<any[]>([]);
  const [reschedLead, setReschedLead] = useState<any | null>(null);
  const [newDate, setNewDate] = useState(
    new Date(Date.now() + 86_400_000).toISOString().split('T')[0]
  );
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (bucket === 'today' || bucket === 'overdue') {
      apiCall(`/follow-ups/${bucket}`)
        .then((res) => {
          const list = res?.followUps || res?.leads || res?.items || res?.data || [];
          setBucketItems(Array.isArray(list) ? list : []);
        })
        .catch(() => setBucketItems([]));
    } else {
      setBucketItems(followUps.length > 0 ? followUps : leads);
    }
  }, [bucket, followUps, leads]);

  const handleComplete = async (item: any) => {
    try {
      await apiCall(`/follow-ups/${item.id}/complete`, 'PUT', {
        outcome: 'Completed from CRM calendar',
      });
      onShowToast('Follow-up marked complete!', 'success');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Completion failed.', 'danger');
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedLead || reason.trim().length < 5) {
      onShowToast('Reason (min 5 chars) is mandatory for follow-up reschedule.', 'warning');
      return;
    }
    try {
      await apiCall(`/leads/${reschedLead.leadId || reschedLead.id}/follow-up`, 'PUT', {
        nextFollowUpDate: newDate,
        reason: reason.trim(),
      });
      onShowToast('Follow-up date updated & audited!', 'success');
      setReschedLead(null);
      setReason('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Reschedule failed.', 'danger');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title"><CrmIcon name="calendar" size={16} /> Follow-up Calendar &amp; Overdue SLA</h3>
          <span className="card-subtitle">Mandatory-reason follow-up rescheduling &amp; completion tracking</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`btn btn-sm ${bucket === 'today' ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setBucket('today')}
          >
            Today Due
          </button>
          <button
            className={`btn btn-sm ${bucket === 'overdue' ? 'btn-danger' : 'btn-outline'}`}
            onClick={() => setBucket('overdue')}
          >
            Overdue
          </button>
          <button
            className={`btn btn-sm ${bucket === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setBucket('all')}
          >
            All ({followUps.length || leads.length})
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Student / Lead</th>
              <th>Parent Mobile</th>
              <th>Next Follow-up</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bucketItems.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                  No follow-ups in "{bucket}" queue.
                </td>
              </tr>
            ) : (
              bucketItems.map((item: any, i: number) => (
                <tr key={item.id || i}>
                  <td>
                    <strong>{item.studentName || item.lead?.studentName || 'Lead'}</strong>
                  </td>
                  <td>{item.fatherPhone || item.mobile || item.lead?.fatherPhone || 'N/A'}</td>
                  <td>
                    {item.nextFollowUpDate || item.scheduledAt
                      ? new Date(item.nextFollowUpDate || item.scheduledAt).toLocaleDateString()
                      : 'Unscheduled'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => setReschedLead(item)}
                      >
                        <CrmIcon name="calendar" size={16} /> Reschedule
                      </button>
                      {item.scheduledAt && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleComplete(item)}
                        >
                          <CrmIcon name="check" size={16} /> Complete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {reschedLead && (
        <div className="modal-overlay" onClick={() => setReschedLead(null)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}><CrmIcon name="calendar" size={16} /> Reschedule Follow-up</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setReschedLead(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleReschedule}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Date</label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mandatory Reason (min 5 chars) *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setReschedLead(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Reschedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function AIView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [board, setBoard] = useState('CBSE');
  const [city, setCity] = useState('Dehradun');
  const [budget, setBudget] = useState('800000');
  const [admissionClass, setAdmissionClass] = useState('Class 8');
  const [genderPref, setGenderPref] = useState('co_ed');
  const [schoolType, setSchoolType] = useState('boarding');
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [myLeads, setMyLeads] = useState<any[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [profileSchool, setProfileSchool] = useState<any | null>(null);

  useEffect(() => {
    apiCall('/leads?limit=50')
      .then((res) => {
        const list = res?.leads || res?.data?.leads || res?.data || [];
        setMyLeads(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, []);

  const handleSelectLeadPreset = (lid: string) => {
    setSelectedLeadId(lid);
    const l = myLeads.find((x: any) => x.id === lid);
    if (!l) return;
    if (l.preferredBoard) setBoard(l.preferredBoard);
    if (l.preferredLocation || l.city) setCity(l.preferredLocation || l.city);
    if (l.budgetMax) setBudget(String(l.budgetMax));
    if (l.applyingForGrade || l.admissionClass) setAdmissionClass(l.applyingForGrade || l.admissionClass);
  };

  const handleRunMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiCall('/match/suggest', 'POST', {
        preferredBoard: board,
        preferredLocation: city,
        budgetMax: Number(budget || 800000),
        admissionClass,
        gender: genderPref,
        school_type: schoolType,
        topN: 15,
      });
      const list =
        res?.suggested_schools ||
        res?.data?.suggested_schools ||
        res?.matches ||
        res?.schools ||
        res?.data?.matches ||
        (Array.isArray(res?.data) ? res.data : []);
      setMatches(Array.isArray(list) ? list : []);
      setCompareIds([]);
      onShowToast(`Matched ${Array.isArray(list) ? list.length : 0} partner schools cleanly.`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Match simulator failed.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleShortlistSchool = async (school: any) => {
    if (!selectedLeadId) {
      onShowToast('Please select a Student Lead above first to add this school to their shortlist.', 'warning');
      return;
    }
    try {
      await apiCall(`/leads/${selectedLeadId}/shortlist`, 'POST', {
        school_id: school.id,
        schoolId: school.id,
        notes: `Shortlisted via 8-Criteria Engine (${Math.round(Number(school.matchScore ?? 0))}% match)`,
      });
      onShowToast(`${school.name} added to student shortlist!`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Could not add to shortlist.', 'danger');
    }
  };

  const handleShareWhatsAppSchool = async (school: any) => {
    const selectedLead = myLeads.find((l: any) => l.id === selectedLeadId);
    const parentName = selectedLead?.fatherName || selectedLead?.parentName || 'Parent';
    const studentName = selectedLead?.studentName || 'your child';
    const msg = `Namaste ${parentName}! Based on your preferences for ${studentName}, we recommend *${school.name}* (${school.board || board}, ${school.city || city}, Annual Fee: ₹${Number(school.minFeeAnnual || school.annualFeeMin || 0).toLocaleString('en-IN')} - ₹${Number(school.maxFeeAnnual || school.annualFeeMax || 0).toLocaleString('en-IN')}). Reply to schedule a campus tour or brochure!`;
    if (selectedLead?.id) {
      try {
        const res = await apiCall('/whatsapp/generate-link', 'POST', {
          lead_id: selectedLead.id,
          leadId: selectedLead.id,
          message: msg,
        });
        const waUrl = res?.waUrl || res?.url || res?.data?.waUrl;
        if (waUrl) window.open(waUrl, '_blank', 'noopener,noreferrer');
        onShowToast('WhatsApp recommendation opened & logged in 3-layer tracker!', 'success');
        return;
      } catch (err: any) {
        onShowToast(err?.message || 'Opening direct WhatsApp share.', 'warning');
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const toggleCompare = (schoolId: string) => {
    setCompareIds((prev) =>
      prev.includes(schoolId) ? prev.filter((id) => id !== schoolId) : prev.length < 4 ? [...prev, schoolId] : prev
    );
  };

  const comparedSchools = matches
    .map((m) => ({ ...(m.school || m), matchScore: m.matchScore ?? m.score ?? 0 }))
    .filter((s) => compareIds.includes(s.id));

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 className="card-title"><CrmIcon name="sparkles" size={16} /> 8-Criteria School Matching &amp; Suggested Schools</h3>
          <span className="card-subtitle">
            Powered by live PostgreSQL master dataset &amp; matching_criteria_weights (=100) — Shortlist, Compare &amp; Share on WhatsApp
          </span>
        </div>
        {compareIds.length >= 2 && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setShowCompareModal(true)}
          >
            Compare Selected ({compareIds.length})
          </button>
        )}
      </div>

      {/* Optional Lead Selector to Auto-Fill & Shortlist */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Link Student Lead (for Shortlist &amp; WhatsApp):</label>
        <select
          className="form-control"
          style={{ maxWidth: '340px' }}
          value={selectedLeadId}
          onChange={(e) => handleSelectLeadPreset(e.target.value)}
        >
          <option value="">-- Optional: Select Assigned Lead to Auto-Fill --</option>
          {myLeads.map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.leadNumber || l.id.slice(0, 6)} — {l.studentName} ({l.applyingForGrade || l.admissionClass || 'Class'})
            </option>
          ))}
        </select>
      </div>

      <form
        onSubmit={handleRunMatch}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        <div>
          <label className="form-label">Board</label>
          <select className="form-control" value={board} onChange={(e) => setBoard(e.target.value)}>
            <option value="CBSE">CBSE</option>
            <option value="ICSE">ICSE</option>
            <option value="IB">IB</option>
            <option value="IGCSE">IGCSE</option>
          </select>
        </div>
        <div>
          <label className="form-label">Location</label>
          <input
            type="text"
            className="form-control"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Max Budget (₹)</label>
          <input
            type="number"
            className="form-control"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Class</label>
          <input
            type="text"
            className="form-control"
            value={admissionClass}
            onChange={(e) => setAdmissionClass(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Gender Pref</label>
          <select className="form-control" value={genderPref} onChange={(e) => setGenderPref(e.target.value)}>
            <option value="co_ed">Co-Ed</option>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
          </select>
        </div>
        <div>
          <label className="form-label">School Type</label>
          <select className="form-control" value={schoolType} onChange={(e) => setSchoolType(e.target.value)}>
            <option value="boarding">Boarding</option>
            <option value="day_boarding">Day Boarding</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Scoring...' : 'Run Match'}
          </button>
        </div>
      </form>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '36px' }}>Cmp</th>
              <th>School</th>
              <th>Board &amp; City</th>
              <th>Annual Fee</th>
              <th>Match Score</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                  Click <strong>Run Match</strong> to score schools from the live PostgreSQL master directory.
                </td>
              </tr>
            ) : (
              matches.map((m: any, idx: number) => {
                const s = { ...(m.school || m), matchScore: m.matchScore ?? m.score ?? 0 };
                return (
                  <tr key={s.id || idx}>
                    <td>
                      <input
                        type="checkbox"
                        checked={compareIds.includes(s.id)}
                        onChange={() => toggleCompare(s.id)}
                        title="Select up to 4 schools to compare"
                      />
                    </td>
                    <td>
                      <strong style={{ cursor: 'pointer', color: '#1E3A8A' }} onClick={() => setProfileSchool(s)}>
                        {s.name}
                      </strong>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {s.genderType || 'Co-Ed'} &bull; Classes {s.classesOffered || '1-12'}
                      </div>
                    </td>
                    <td>
                      {s.board} &bull; {s.city}{s.state ? `, ${s.state}` : ''}
                    </td>
                    <td>
                      ₹{Number(s.minFeeAnnual || s.annualFeeMin || 0).toLocaleString('en-IN')} - ₹
                      {Number(s.maxFeeAnnual || s.annualFeeMax || 0).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <span className="badge badge-success">
                        {Math.round(Number(s.matchScore || 0))}% Match
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => setProfileSchool(s)}>
                          Profile
                        </button>
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => handleShortlistSchool(s)}>
                          + Shortlist
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          style={{ color: '#15803D', borderColor: '#BBF7D0' }}
                          onClick={() => handleShareWhatsAppSchool(s)}
                        >
                          WhatsApp
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

      {/* School Profile Modal */}
      {profileSchool && (
        <div className="modal-overlay" onClick={() => setProfileSchool(null)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>{profileSchool.name}</h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setProfileSchool(null)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div><strong>Board:</strong> {profileSchool.board || '—'} &bull; <strong>Location:</strong> {profileSchool.city}, {profileSchool.state}</div>
              <div><strong>Annual Fee Range:</strong> ₹{Number(profileSchool.minFeeAnnual || profileSchool.annualFeeMin || 0).toLocaleString('en-IN')} – ₹{Number(profileSchool.maxFeeAnnual || profileSchool.annualFeeMax || 0).toLocaleString('en-IN')}</div>
              <div><strong>Classes Offered:</strong> {profileSchool.classesOffered || '1-12'} &bull; <strong>Type:</strong> {profileSchool.genderType || 'Co-Ed'}</div>
              <div><strong>Match Score:</strong> <span className="badge badge-success">{Math.round(Number(profileSchool.matchScore || 0))}%</span></div>
              {profileSchool.phone && <div><strong>Contact:</strong> {profileSchool.phone}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => handleShareWhatsAppSchool(profileSchool)}>
                Share on WhatsApp
              </button>
              <button type="button" className="btn btn-primary" onClick={() => handleShortlistSchool(profileSchool)}>
                Add to Shortlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side School Comparison Modal */}
      {showCompareModal && comparedSchools.length >= 2 && (
        <div className="modal-overlay" onClick={() => setShowCompareModal(false)}>
          <div className="modal-content" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>
                School Comparison ({comparedSchools.length} Schools)
              </h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowCompareModal(false)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Criteria</th>
                      {comparedSchools.map((s) => (
                        <th key={s.id}>{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Match Score</strong></td>
                      {comparedSchools.map((s) => (
                        <td key={s.id}><span className="badge badge-success">{Math.round(Number(s.matchScore || 0))}%</span></td>
                      ))}
                    </tr>
                    <tr>
                      <td><strong>Board</strong></td>
                      {comparedSchools.map((s) => <td key={s.id}>{s.board || '—'}</td>)}
                    </tr>
                    <tr>
                      <td><strong>City / State</strong></td>
                      {comparedSchools.map((s) => <td key={s.id}>{s.city}{s.state ? `, ${s.state}` : ''}</td>)}
                    </tr>
                    <tr>
                      <td><strong>Annual Fee</strong></td>
                      {comparedSchools.map((s) => (
                        <td key={s.id}>₹{Number(s.minFeeAnnual || s.annualFeeMin || 0).toLocaleString('en-IN')} – ₹{Number(s.maxFeeAnnual || s.annualFeeMax || 0).toLocaleString('en-IN')}</td>
                      ))}
                    </tr>
                    <tr>
                      <td><strong>Gender / Type</strong></td>
                      {comparedSchools.map((s) => <td key={s.id}>{s.genderType || 'Co-Ed'}</td>)}
                    </tr>
                    <tr>
                      <td><strong>Classes</strong></td>
                      {comparedSchools.map((s) => <td key={s.id}>{s.classesOffered || '1-12'}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setShowCompareModal(false)}>
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SMART_TEMPLATE_PRESETS = [
  {
    name: 'Welcome Parent Enquiry',
    body: 'Namaste {parentName}! Thank you for contacting BoardingEdu for {studentName}. Our counsellor will shortly share the best boarding school options matching your budget & board preference.',
  },
  {
    name: 'Curated School Shortlist Share',
    body: 'Dear {parentName}, based on your preferences for {studentName}, we have shortlisted top boarding schools including {schoolName}. Please reply to schedule a campus visit or Zoom session.',
  },
  {
    name: 'Campus Tour & School Visit Invitation',
    body: 'Hello {parentName}, your campus visit to {schoolName} for {studentName} is ready to be scheduled. Please confirm your preferred date and time slot.',
  },
  {
    name: 'Online Zoom Virtual Tour Link',
    body: 'Dear {parentName}, join the online Zoom virtual school tour for {schoolName} ({studentName}). Our Senior Manager will walk you through hostel, academics, and fee details.',
  },
  {
    name: 'Parent Follow-up Reminder',
    body: 'Hello {parentName}, checking in regarding {studentName}\'s boarding school admission at {schoolName}. Let us know if you have any questions about entrance test or fee structure.',
  },
  {
    name: 'Fee Installment & Payment Confirmation',
    body: 'Dear {parentName}, thank you! We have received the fee installment for {studentName} at {schoolName}. Your official receipt has been updated in our admission ledger.',
  },
  {
    name: 'Document Checklist for Admission',
    body: 'Dear {parentName}, to complete {studentName}\'s registration at {schoolName}, please share Birth Certificate, Transfer Certificate (TC), previous report card, and 4 passport photos.',
  },
  {
    name: 'Admission Confirmed Congratulations',
    body: 'Congratulations {parentName}! {studentName}\'s admission to {schoolName} has been officially confirmed. Wishing {studentName} a bright future ahead!',
  },
];

export function WhatsAppView({
  onShowToast,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplBody, setTplBody] = useState(
    'Namaste {parentName}! Sharing {schoolName} boarding details for {studentName}.'
  );
  const [tplSearch, setTplSearch] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);

  const [showBotModal, setShowBotModal] = useState(false);
  const [botStatus, setBotStatus] = useState<any>({ isConnected: false });

  const loadWaData = async () => {
    try {
      const [tRes, lRes, bRes] = await Promise.all([
        apiCall('/whatsapp-templates').catch(() => ({ templates: [] })),
        apiCall('/whatsapp/log').catch(() => ({ logs: [] })),
        apiCall('/whatsapp/bot/status?init=false').catch(() => ({ isConnected: false })),
      ]);
      setTemplates(tRes?.templates || tRes?.data?.templates || []);
      setLogs(lRes?.logs || lRes?.items || lRes?.data || []);
      setBotStatus(bRes?.data || bRes || { isConnected: false });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadWaData();
    const interval = setInterval(() => {
      apiCall('/whatsapp/bot/status?init=false')
        .then((res) => setBotStatus(res?.data || res))
        .catch(() => {});
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Smart half-name / partial substring matching for existing templates
  const filteredTemplates = templates.filter((t: any) => {
    const q = tplSearch.trim().toLowerCase();
    if (!q) return true;
    const name = String(t.name || t.title || '').toLowerCase();
    const body = String(t.content || t.body || t.templateText || '').toLowerCase();
    return q.split(/\s+/).every((part) => name.includes(part) || body.includes(part));
  });

  // Smart preset + existing template suggestions when typing half name in "Create New Template"
  const newTplSuggestions = (() => {
    const q = tplName.trim().toLowerCase();
    if (!q) return [];
    const combined = [
      ...templates.map((t: any) => ({
        name: String(t.name || t.title || ''),
        body: String(t.content || t.body || t.templateText || ''),
        source: 'Existing',
      })),
      ...SMART_TEMPLATE_PRESETS.map((p) => ({ ...p, source: 'Suggested' })),
    ];
    const seen = new Set<string>();
    return combined
      .filter((item) => {
        const key = item.name.toLowerCase();
        if (!key || seen.has(key)) return false;
        const matches = q.split(/\s+/).every((part) => key.includes(part) || item.body.toLowerCase().includes(part));
        if (matches) seen.add(key);
        return matches;
      })
      .slice(0, 6);
  })();

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tplBody.length > 2000) {
      onShowToast('Template exceeds 2000 character limit.', 'warning');
      return;
    }
    try {
      await apiCall('/whatsapp-templates', 'POST', {
        name: tplName.trim(),
        category: 'admission_followup',
        content: tplBody.trim(),
      });
      onShowToast('WhatsApp template registered cleanly!', 'success');
      setShowNewTpl(false);
      setTplName('');
      loadWaData();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to save template.', 'danger');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* WhatsApp Bot Connection Card */}
      <div
        style={{
          background: botStatus?.isConnected
            ? 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)'
            : 'linear-gradient(135deg, #FEF3C7 0%, #FEF9C3 100%)',
          border: botStatus?.isConnected ? '2px solid #86EFAC' : '2px solid #FDE047',
          borderRadius: '16px',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              backgroundColor: botStatus?.isConnected ? '#16A34A' : '#D97706',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
            }}
          >
            {botStatus?.isConnected ? <CrmIcon name="check" size={22} /> : <CrmIcon name="message-square" size={22} />}
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
              WhatsApp Bot &amp; Personal Sender: {botStatus?.isConnected ? 'CONNECTED & ACTIVE' : 'CONNECT PHONE (QR / OTP)'}
            </div>
            <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>
              {botStatus?.isConnected
                ? `Active Sender: +${botStatus.activeNumber || '7249417658'} • Every manager and counsellor can connect their personal WhatsApp to message parents directly.`
                : 'Connect your WhatsApp account to enable direct parent messaging (QR Code Scan or Mobile Number & OTP Verification).'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowBotModal(true)}
          style={{
            backgroundColor: botStatus?.isConnected ? '#0F172A' : '#16A34A',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CrmIcon name={botStatus?.isConnected ? 'settings' : 'message-square'} size={16} />
          <span>{botStatus?.isConnected ? 'Manage WhatsApp / Change Number' : 'Connect WhatsApp (QR / OTP)'}</span>
        </button>
      </div>

      <WhatsAppBotModal
        isOpen={showBotModal}
        onClose={() => {
          setShowBotModal(false);
          loadWaData();
        }}
        onShowToast={onShowToast}
      />

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 className="card-title"><CrmIcon name="smartphone" size={16} /> WhatsApp Templates &amp; 3-Layer Activity Centre</h3>
            <span className="card-subtitle">
              Type even a half name (e.g. &ldquo;camp&rdquo;, &ldquo;fol&rdquo;, &ldquo;short&rdquo;, &ldquo;admi&rdquo;) to get instant full template suggestions
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              setTplName('');
              setShowNewTpl(true);
            }}
          >
            <CrmIcon name="plus" size={16} /> New Template
          </button>
        </div>

        {/* Smart Half-Name Template Search & Live Autocomplete Suggestions */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search template by half name (e.g. camp, fol, short, adm, wel)..."
                value={tplSearch}
                onFocus={() => setShowSearchDropdown(true)}
                onBlur={() => setTimeout(() => setShowSearchDropdown(false), 180)}
                onChange={(e) => {
                  setTplSearch(e.target.value);
                  setShowSearchDropdown(true);
                  if (!e.target.value.trim()) setSelectedTemplate(null);
                }}
              />
              {showSearchDropdown && tplSearch.trim().length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: '#FFFFFF',
                    border: '1.5px solid #93C5FD',
                    borderRadius: '10px',
                    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
                    zIndex: 50,
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  {filteredTemplates.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: '12.5px', color: '#64748B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span>No saved template matching &ldquo;{tplSearch}&rdquo;</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTplName(tplSearch.trim());
                          setShowSearchDropdown(false);
                          setShowNewTpl(true);
                        }}
                      >
                        + Create &ldquo;{tplSearch.trim()}&rdquo;
                      </button>
                    </div>
                  ) : (
                    filteredTemplates.map((t: any, idx: number) => {
                      const title = t.name || t.title || 'Template';
                      const body = t.content || t.body || t.templateText || '';
                      return (
                        <div
                          key={t.id || idx}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setTplSearch(title);
                            setSelectedTemplate(t);
                            setShowSearchDropdown(false);
                          }}
                          style={{
                            padding: '10px 14px',
                            borderBottom: '1px solid #F1F5F9',
                            cursor: 'pointer',
                            background: '#FFFFFF',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#EFF6FF')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '13px', color: '#1E3A8A' }}>{title}</strong>
                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#15803D', background: '#DCFCE7', padding: '1px 7px', borderRadius: '999px' }}>
                              Use Suggestion
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {body}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            {tplSearch && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setTplSearch('');
                  setSelectedTemplate(null);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Selected Template Quick Copy / Preview Box */}
        {selectedTemplate && (
          <div
            style={{
              background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)',
              border: '1.5px solid #93C5FD',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <strong style={{ fontSize: '14px', color: '#0F172A' }}>
                ✨ Selected Template: {selectedTemplate.name || selectedTemplate.title}
              </strong>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={() => {
                    const txt = selectedTemplate.content || selectedTemplate.body || selectedTemplate.templateText || '';
                    navigator.clipboard?.writeText(txt).catch(() => {});
                    onShowToast('Template message copied to clipboard!', 'success');
                  }}
                >
                  Copy Message
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => setSelectedTemplate(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.5, background: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              {selectedTemplate.content || selectedTemplate.body || selectedTemplate.templateText}
            </div>
          </div>
        )}

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Template Name ({filteredTemplates.length})</th>
                <th>Body Preview</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#64748B' }}>
                    No templates match &ldquo;{tplSearch}&rdquo;.
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((t: any, i: number) => (
                  <tr
                    key={t.id || i}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedTemplate(t);
                      setTplSearch(t.name || t.title || '');
                    }}
                  >
                    <td>
                      <strong>{t.name || t.title}</strong>
                    </td>
                    <td>{t.content || t.body || t.templateText}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          const txt = t.content || t.body || t.templateText || '';
                          navigator.clipboard?.writeText(txt).catch(() => {});
                          onShowToast(`Copied "${t.name || t.title}"!`, 'success');
                        }}
                      >
                        Copy
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title"><CrmIcon name="clipboard" size={16} /> Recent Logged WhatsApp Dispatches ({logs.length})</h3>
        </div>
        <div style={{ maxHeight: '260px', overflowY: 'auto', fontSize: '12.5px' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#64748B' }}>No WhatsApp messages logged yet.</div>
          ) : (
            logs.slice(0, 20).map((lg: any, i: number) => (
              <div key={lg.id || i} style={{ padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                <strong>{lg.recipientPhone || lg.phone || 'Parent'}</strong> &bull;{' '}
                <span className="badge badge-success">{lg.status || 'sent'}</span>
                <div style={{ color: '#475569', marginTop: '2px' }}>{lg.message}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {showNewTpl && (
        <div className="modal-overlay" onClick={() => setShowNewTpl(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}><CrmIcon name="plus" size={16} /> Create WhatsApp Template</h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowNewTpl(false)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveTemplate}>
              <div className="modal-body">
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Template Name * (Type half name for smart suggestions)</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. camp, fee, zoom, wel, short, doc..."
                    value={tplName}
                    onFocus={() => setShowPresetDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPresetDropdown(false), 180)}
                    onChange={(e) => {
                      setTplName(e.target.value);
                      setShowPresetDropdown(true);
                    }}
                  />
                  {showPresetDropdown && newTplSuggestions.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        background: '#FFFFFF',
                        border: '1.5px solid #93C5FD',
                        borderRadius: '10px',
                        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.16)',
                        zIndex: 60,
                        maxHeight: '210px',
                        overflowY: 'auto',
                      }}
                    >
                      {newTplSuggestions.map((s, idx) => (
                        <div
                          key={idx}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setTplName(s.name);
                            setTplBody(s.body);
                            setShowPresetDropdown(false);
                          }}
                          style={{
                            padding: '9px 12px',
                            borderBottom: '1px solid #F1F5F9',
                            cursor: 'pointer',
                            background: '#FFFFFF',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#EFF6FF')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '12.5px', color: '#1E3A8A' }}>{s.name}</strong>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#1D4ED8', background: '#DBEAFE', padding: '1px 6px', borderRadius: '999px' }}>
                              {s.source}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Message ({tplBody.length}/2000)</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    maxLength={2000}
                    required
                    value={tplBody}
                    onChange={(e) => setTplBody(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowNewTpl(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
