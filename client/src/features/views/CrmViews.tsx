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
export { UserProfileView } from '../profile/UserProfileView';

export function TeamsView({
  teams = [],
  users = [],
  isLoading = false,
  onRefresh,
  onShowToast,
}: {
  teams: any[];
  users?: any[];
  isLoading?: boolean;
  onRefresh: () => void;
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [region, setRegion] = useState('Uttarakhand');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamPage, setTeamPage] = useState(1);
  const [teamPageSize, setTeamPageSize] = useState(25);

  // Manage Team Members Modal State
  const [managingTeam, setManagingTeam] = useState<any | null>(null);
  const [transferTargetTeam, setTransferTargetTeam] = useState<Record<string, string>>({});
  const [selectedExistingUserId, setSelectedExistingUserId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Add New Counsellor Modal State
  const [showCreateCounsellor, setShowCreateCounsellor] = useState(false);
  const [newCounsellorName, setNewCounsellorName] = useState('');
  const [newCounsellorEmail, setNewCounsellorEmail] = useState('');
  const [newCounsellorMobile, setNewCounsellorMobile] = useState('');
  const [newCounsellorPassword, setNewCounsellorPassword] = useState('Welcome@123');
  const [newCounsellorTeamId, setNewCounsellorTeamId] = useState('');
  const [isCreatingCounsellor, setIsCreatingCounsellor] = useState(false);

  // Helper to get members belonging to a team
  const getTeamMembers = (team: any) => {
    if (!team) return [];
    const teamId = team.id || team._id;
    const teamCode = team.teamId || team.teamCode;

    // Match by users prop
    const fromUsers = users.filter((u: any) => {
      const uTeamId = u.teamId?.id || u.teamId?._id || u.teamId || u.team?.id || u.team_id;
      const uTeamName = u.teamName || u.team?.name || u.teamId?.name;
      return (
        (teamId && uTeamId === teamId) ||
        (teamCode && uTeamId === teamCode) ||
        (uTeamName && team.name && String(uTeamName).toLowerCase() === String(team.name).toLowerCase())
      );
    });

    if (fromUsers.length > 0) return fromUsers;
    return Array.isArray(team.counsellors) ? team.counsellors : [];
  };

  // Helper to get all counsellors across CRM
  const allCounsellors = users.filter((u: any) => {
    const r = String(u.role || u.rawRole || '').toLowerCase();
    return !r.includes('admin');
  });

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

  // Transfer single member to another team
  const handleTransferMember = async (userId: string, targetTeamId: string) => {
    if (!userId) return;
    setIsTransferring(true);
    try {
      const resolvedTeamId = targetTeamId === 'UNASSIGN' ? null : targetTeamId;
      await apiCall(`/users/${userId}/role`, 'PATCH', {
        teamId: resolvedTeamId,
      });

      const targetTeamName = teams.find((t: any) => (t.id || t._id) === resolvedTeamId)?.name || 'Unassigned';
      onShowToast(
        resolvedTeamId
          ? `Counsellor transferred to ${targetTeamName} successfully!`
          : 'Counsellor removed from team cleanly.',
        'success'
      );
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to transfer member.', 'danger');
    } finally {
      setIsTransferring(false);
    }
  };

  // Assign existing counsellor to current team
  const handleAssignExistingCounsellor = async () => {
    if (!selectedExistingUserId || !managingTeam) {
      onShowToast('Please select a counsellor to assign.', 'warning');
      return;
    }
    setIsTransferring(true);
    try {
      await apiCall(`/users/${selectedExistingUserId}/role`, 'PATCH', {
        teamId: managingTeam.id || managingTeam._id,
      });
      onShowToast(`Counsellor assigned to ${managingTeam.name} successfully!`, 'success');
      setSelectedExistingUserId('');
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to assign counsellor.', 'danger');
    } finally {
      setIsTransferring(false);
    }
  };

  // Register brand new counsellor
  const handleCreateNewCounsellor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCounsellorName.trim() || !newCounsellorEmail.trim() || !newCounsellorMobile.trim()) {
      onShowToast('Please fill all required fields.', 'warning');
      return;
    }
    setIsCreatingCounsellor(true);
    try {
      const cleanPhone = newCounsellorMobile.replace(/\D/g, '').slice(-10);
      await apiCall('/users', 'POST', {
        fullName: newCounsellorName.trim(),
        email: newCounsellorEmail.trim(),
        mobile: cleanPhone,
        password: newCounsellorPassword.trim() || 'Welcome@123',
        role: 'COUNSELLOR',
        teamId: newCounsellorTeamId || null,
      });

      const assignedTeamName = teams.find((t: any) => (t.id || t._id) === newCounsellorTeamId)?.name;
      onShowToast(
        `New Counsellor ${newCounsellorName.trim()} registered${assignedTeamName ? ` and assigned to Team ${assignedTeamName}` : ''}!`,
        'success'
      );

      // Reset form & close
      setNewCounsellorName('');
      setNewCounsellorEmail('');
      setNewCounsellorMobile('');
      setNewCounsellorPassword('Welcome@123');
      setShowCreateCounsellor(false);
      onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to create new counsellor.', 'danger');
    } finally {
      setIsCreatingCounsellor(false);
    }
  };

  // When managing a team, keep its data synced with the fresh teams list
  const activeManagingTeam = managingTeam
    ? teams.find((t: any) => (t.id || t._id) === (managingTeam.id || managingTeam._id)) || managingTeam
    : null;
  const currentTeamMembers = activeManagingTeam ? getTeamMembers(activeManagingTeam) : [];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">
            <CrmIcon name="users" size={16} /> Team Structure &amp; Hierarchies ({isLoading ? '...' : teams.length})
          </h3>
          <span className="card-subtitle">Manage Counsellor &amp; Manager regional pods &amp; assign members</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setNewCounsellorTeamId(teams[0]?.id || '');
              setShowCreateCounsellor(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            <CrmIcon name="user-plus" size={15} color="#2563EB" />
            <span>+ Add New Counsellor</span>
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
            <CrmIcon name="plus" size={16} /> Create Team
          </button>
        </div>
      </div>

      {/* Responsive Search Bar for 500+ Teams */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 16px',
          background: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          className="form-control"
          value={teamSearch}
          onChange={(e) => {
            setTeamSearch(e.target.value);
            setTeamPage(1);
          }}
          placeholder="Search team by name, code, region or manager..."
          style={{ flex: '1 1 220px', minWidth: '180px', maxWidth: '380px', height: '35px', fontSize: '13px' }}
        />
        {teamSearch && (
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => {
              setTeamSearch('');
              setTeamPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {(() => {
        const q = teamSearch.trim().toLowerCase();
        const filteredTeams = q
          ? teams.filter((t: any) =>
              `${t.name || ''} ${t.teamId || ''} ${t.teamCode || ''} ${t.region || ''} ${t.description || ''} ${t.managerName || t.manager?.fullName || ''}`
                .toLowerCase()
                .includes(q)
            )
          : teams;
        const totalTeamPages = Math.max(1, Math.ceil(filteredTeams.length / teamPageSize));
        const safeTeamPage = Math.min(teamPage, totalTeamPages);
        const visibleTeams = filteredTeams.slice(
          (safeTeamPage - 1) * teamPageSize,
          safeTeamPage * teamPageSize
        );
        return (
      <>
      <div className="table-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Team Name</th>
              <th>Region</th>
              <th>Members / Counsellors</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: '#64748B', padding: '30px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '13.5px', fontWeight: 600 }}>
                    <span style={{ width: '18px', height: '18px', border: '2px solid #CBD5E1', borderTopColor: '#2563EB', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                    Loading teams &amp; members...
                  </div>
                </td>
              </tr>
            ) : visibleTeams.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                  {teamSearch ? 'No teams match your search.' : 'No teams configured yet.'}
                </td>
              </tr>
            ) : (
              visibleTeams.map((t: any) => {
                const members = getTeamMembers(t);
                return (
                  <tr key={t.id || t._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: '#EFF6FF',
                            color: '#2563EB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '12px',
                          }}
                        >
                          {t.name ? t.name.slice(0, 2).toUpperCase() : 'TM'}
                        </div>
                        <div>
                          <strong>{t.name}</strong>
                          {t.teamId && (
                            <div style={{ fontSize: '11px', color: '#94A3B8' }}>{t.teamId}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{t.region || t.description || 'Uttarakhand'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: members.length > 0 ? '#EFF6FF' : '#F1F5F9',
                            color: members.length > 0 ? '#1D4ED8' : '#64748B',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <CrmIcon name="users" size={13} />
                          {members.length} {members.length === 1 ? 'Counsellor' : 'Counsellors'}
                        </span>
                        {members.length > 0 && (
                          <span style={{ fontSize: '11px', color: '#64748B' }}>
                            ({members.slice(0, 2).map((m: any) => m.fullName || m.name).join(', ')}
                            {members.length > 2 ? ` +${members.length - 2} more` : ''})
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${t.isActive !== false ? 'badge-success' : 'badge-warning'}`}>
                        {t.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => setManagingTeam(t)}
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                          title="View and transfer members of this team"
                        >
                          <CrmIcon name="users" size={14} /> Manage Members
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            setNewCounsellorTeamId(t.id || t._id);
                            setShowCreateCounsellor(true);
                          }}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                          title="Add a new counsellor directly to this team"
                        >
                          <CrmIcon name="user-plus" size={14} /> Add
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => handleToggleTeam(t.id || t._id)}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                          title="Toggle Active / Inactive"
                        >
                          <CrmIcon name="play" size={13} /> Toggle
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
      {filteredTeams.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '12px 16px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            fontSize: '12.5px',
            color: '#475569',
          }}
        >
          <div style={{ fontWeight: 600 }}>
            Showing <strong>{(safeTeamPage - 1) * teamPageSize + 1}</strong>–
            <strong>{Math.min(safeTeamPage * teamPageSize, filteredTeams.length)}</strong> of{' '}
            <strong>{filteredTeams.length}</strong> teams
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className="form-control"
              value={teamPageSize}
              onChange={(e) => {
                setTeamPageSize(Number(e.target.value));
                setTeamPage(1);
              }}
              style={{ width: 'auto', height: '30px', padding: '2px 8px', fontSize: '12px' }}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={safeTeamPage <= 1}
              onClick={() => setTeamPage((p) => Math.max(1, p - 1))}
            >
              &larr; Prev
            </button>
            <span style={{ fontWeight: 700, color: '#0F172A' }}>
              Page {safeTeamPage} / {totalTeamPages}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={safeTeamPage >= totalTeamPages}
              onClick={() => setTeamPage((p) => Math.min(totalTeamPages, p + 1))}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}
      </>
        );
      })()}

      {/* Modal 1: Manage Team Members (Transfer / Add Member) */}
      {activeManagingTeam && (
        <div className="modal-overlay" onClick={() => setManagingTeam(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '640px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setManagingTeam(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#EFF6FF',
                    color: '#1D4ED8',
                    border: '1.5px solid #93C5FD',
                    borderRadius: '8px',
                    padding: '5px 11px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <CrmIcon name="arrow-left" size={15} color="#1D4ED8" />
                  <span>Back</span>
                </button>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CrmIcon name="users" size={18} color="#2563EB" />
                    Manage Team Members — {activeManagingTeam.name}
                  </h3>
                  <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                    Transfer counsellors between teams or assign new members to this team
                  </span>
                </div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setManagingTeam(null)} title="Close">
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Section 1: Current Team Members */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#1E293B' }}>
                    Current Team Members ({currentTeamMembers.length})
                  </h4>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setNewCounsellorTeamId(activeManagingTeam.id || activeManagingTeam._id);
                      setShowCreateCounsellor(true);
                    }}
                    style={{ fontSize: '11.5px', padding: '3px 8px' }}
                  >
                    <CrmIcon name="user-plus" size={13} /> + New Counsellor
                  </button>
                </div>

                {currentTeamMembers.length === 0 ? (
                  <div
                    style={{
                      padding: '24px',
                      textAlign: 'center',
                      background: '#F8FAFC',
                      borderRadius: '10px',
                      border: '1px dashed #CBD5E1',
                      color: '#64748B',
                      fontSize: '12.5px',
                    }}
                  >
                    No counsellors are assigned to <strong>{activeManagingTeam.name}</strong> yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentTeamMembers.map((member: any) => {
                      const memberId = member.id || member._id;
                      const selectedTeam = transferTargetTeam[memberId] || '';
                      return (
                        <div
                          key={memberId}
                          style={{
                            padding: '12px 14px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #3B82F6, #EC4899)',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 800,
                              }}
                            >
                              {(member.fullName || member.name || 'CO').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                                {member.fullName || member.name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748B' }}>
                                {member.email} {member.phone ? `• ${member.phone}` : ''} • {member.employeeId || 'Counsellor'}
                              </div>
                            </div>
                          </div>

                          {/* Action: Transfer to Another Team */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <select
                              className="form-control"
                              style={{ fontSize: '12px', padding: '4px 8px', minHeight: '32px', width: 'auto' }}
                              value={selectedTeam}
                              onChange={(e) =>
                                setTransferTargetTeam({ ...transferTargetTeam, [memberId]: e.target.value })
                              }
                            >
                              <option value="">Move to Team...</option>
                              {teams
                                .filter((t: any) => (t.id || t._id) !== (activeManagingTeam.id || activeManagingTeam._id))
                                .map((t: any) => (
                                  <option key={t.id || t._id} value={t.id || t._id}>
                                    Transfer to {t.name}
                                  </option>
                                ))}
                              <option value="UNASSIGN">Remove from Team</option>
                            </select>
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={!selectedTeam || isTransferring}
                              onClick={() => handleTransferMember(memberId, selectedTeam)}
                              style={{ fontSize: '11.5px', padding: '5px 10px' }}
                            >
                              Transfer
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: Assign Existing Counsellor */}
              <div
                style={{
                  padding: '14px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '10px',
                }}
              >
                <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: 700, color: '#1E40AF' }}>
                  Assign Existing Counsellor to {activeManagingTeam.name}
                </h4>
                <p style={{ margin: '0 0 10px 0', fontSize: '11.5px', color: '#3B82F6' }}>
                  Select an unassigned counsellor or a counsellor from another team to move here:
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select
                    className="form-control"
                    style={{ flex: 1, minHeight: '36px', fontSize: '12.5px' }}
                    value={selectedExistingUserId}
                    onChange={(e) => setSelectedExistingUserId(e.target.value)}
                  >
                    <option value="">Choose a Counsellor...</option>
                    {allCounsellors
                      .filter((c: any) => {
                        const cTeamId = c.teamId || c.team?.id;
                        return cTeamId !== (activeManagingTeam.id || activeManagingTeam._id);
                      })
                      .map((c: any) => {
                        const currentTeam = teams.find((t: any) => (t.id || t._id) === (c.teamId || c.team?.id));
                        return (
                          <option key={c.id || c._id} value={c.id || c._id}>
                            {c.fullName || c.name} ({c.email}) {currentTeam ? `[Current: ${currentTeam.name}]` : '[Unassigned]'}
                          </option>
                        );
                      })}
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!selectedExistingUserId || isTransferring}
                    onClick={handleAssignExistingCounsellor}
                  >
                    <CrmIcon name="check" size={14} /> Assign to Team
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setManagingTeam(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Add New Counsellor Modal */}
      {showCreateCounsellor && (
        <div className="modal-overlay" onClick={() => setShowCreateCounsellor(false)}>
          <div className="modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CrmIcon name="user-plus" size={17} color="#2563EB" />
                Add New Counsellor
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowCreateCounsellor(false)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateNewCounsellor}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={newCounsellorName}
                    onChange={(e) => setNewCounsellorName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                    Email Address (Login ID) *
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    required
                    placeholder="e.g. rahul@boardingedu.com"
                    value={newCounsellorEmail}
                    onChange={(e) => setNewCounsellorEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                    Mobile Number (10 Digits) *
                  </label>
                  <input
                    type="tel"
                    className="form-control"
                    required
                    placeholder="e.g. 9876543210"
                    maxLength={10}
                    value={newCounsellorMobile}
                    onChange={(e) => setNewCounsellorMobile(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                    Default Password *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={newCounsellorPassword}
                    onChange={(e) => setNewCounsellorPassword(e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: '#64748B', marginTop: '3px', display: 'block' }}>
                    Counsellor can change this password after their first login.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                    Assign to Team
                  </label>
                  <select
                    className="form-control"
                    value={newCounsellorTeamId}
                    onChange={(e) => setNewCounsellorTeamId(e.target.value)}
                  >
                    <option value="">None (Unassigned)</option>
                    {teams.map((t: any) => (
                      <option key={t.id || t._id} value={t.id || t._id}>
                        Team {t.name} ({t.region || 'Uttarakhand'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowCreateCounsellor(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isCreatingCounsellor}
                >
                  <CrmIcon name="check" size={15} />
                  <span>{isCreatingCounsellor ? 'Registering...' : 'Register Counsellor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Create Team Modal */}
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
    const msg = `Hello ${parentName}! Based on your preferences for ${studentName}, we recommend *${school.name}* (${school.board || board}, ${school.city || city}, Annual Fee: ₹${Number(school.minFeeAnnual || school.annualFeeMin || 0).toLocaleString('en-IN')} - ₹${Number(school.maxFeeAnnual || school.annualFeeMax || 0).toLocaleString('en-IN')}). Reply to schedule a campus tour or brochure!`;
    const targetPhone = String(selectedLead?.whatsappNumber || selectedLead?.parentPhone || '').replace(/\D/g, '').slice(-10);
    const fallbackUrl = targetPhone ? `https://wa.me/91${targetPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    if (selectedLead?.id) {
      try {
        const res = await apiCall('/whatsapp/generate-link', 'POST', {
          lead_id: selectedLead.id,
          leadId: selectedLead.id,
          message: msg,
        });
        const waUrl = res?.whatsappUrl || res?.whatsapp_url || res?.waUrl || res?.url || res?.data?.whatsappUrl || res?.data?.whatsapp_url || res?.data?.waUrl || res?.data?.url || fallbackUrl;
        const opened = window.open(waUrl, '_blank', 'noopener,noreferrer');
        if (!opened || opened.closed || typeof opened.closed === 'undefined') {
          window.location.href = waUrl;
        }
        onShowToast(`WhatsApp recommendation for ${school.name} opened!`, 'success');
        return;
      } catch (err: any) {
        onShowToast(err?.message || 'Opening direct WhatsApp share.', 'warning');
      }
    }
    const opened = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    if (!opened || opened.closed || typeof opened.closed === 'undefined') {
      window.location.href = fallbackUrl;
    }
  };

  const handleShareSelectedWhatsApp = async () => {
    if (compareIds.length === 0) {
      onShowToast('Please select at least 1 school to share on WhatsApp.', 'warning');
      return;
    }
    const selectedLead = myLeads.find((l: any) => l.id === selectedLeadId);
    const parentName = selectedLead?.fatherName || selectedLead?.parentName || 'Parent';
    const studentName = selectedLead?.studentName || 'your child';

    const selectedSchools = matches
      .map((m: any, idx: number) => {
        const sId = getSchoolId(m, idx);
        return { ...(m.school || m), id: sId, matchScore: m.matchScore ?? m.score ?? 0 };
      })
      .filter((s: any) => compareIds.includes(s.id));

    let msg = `Hello ${parentName}! Based on your admission requirements for *${studentName}*, here is our curated recommendation of ${selectedSchools.length} top boarding schools:\n\n`;
    selectedSchools.forEach((s: any, idx: number) => {
      const minFee = Number(s.minFeeAnnual || s.annualFeeMin || 0).toLocaleString('en-IN');
      const maxFee = Number(s.maxFeeAnnual || s.annualFeeMax || 0).toLocaleString('en-IN');
      msg += `${idx + 1}. *${s.name}*\n   📍 ${s.city || city}, ${s.state || 'Uttarakhand'} | ${s.board || board}\n   💰 Annual Fee: ₹${minFee} - ₹${maxFee}\n   🎯 Match Score: ${Math.round(Number(s.matchScore || 90))}%\n\n`;
    });
    msg += `Please reply with the school name or number to receive the full brochure, fee breakdown, or schedule a campus visit.\n\nWarm regards,\n*BoardingEdu Admissions Team*`;

    const targetPhone = String(selectedLead?.whatsappNumber || selectedLead?.parentPhone || '').replace(/\D/g, '').slice(-10);
    const fallbackUrl = targetPhone ? `https://wa.me/91${targetPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    if (selectedLead?.id) {
      try {
        const res = await apiCall('/whatsapp/generate-link', 'POST', {
          lead_id: selectedLead.id,
          leadId: selectedLead.id,
          message: msg,
        });
        const waUrl = res?.whatsappUrl || res?.whatsapp_url || res?.waUrl || res?.url || res?.data?.whatsappUrl || res?.data?.whatsapp_url || res?.data?.waUrl || res?.data?.url || fallbackUrl;
        const opened = window.open(waUrl, '_blank', 'noopener,noreferrer');
        if (!opened || opened.closed || typeof opened.closed === 'undefined') {
          window.location.href = waUrl;
        }
        onShowToast(`${selectedSchools.length} School recommendations opened on WhatsApp!`, 'success');
        return;
      } catch (err: any) {
        onShowToast(err?.message || 'Opening direct WhatsApp share.', 'warning');
      }
    }
    const opened = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    if (!opened || opened.closed || typeof opened.closed === 'undefined') {
      window.location.href = fallbackUrl;
    }
  };

  const getSchoolId = (m: any, idx: number) => {
    const s = m?.school || m || {};
    return String(s.id || s._id || s.school_id || s.schoolId || s.schoolCode || s.name || `school_${idx}`);
  };

  const toggleCompare = (schoolId: string) => {
    setCompareIds((prev) =>
      prev.includes(schoolId) ? prev.filter((id) => id !== schoolId) : [...prev, schoolId]
    );
  };

  const toggleSelectAll = () => {
    const allIds = matches.map((m: any, idx: number) => getSchoolId(m, idx));
    if (allIds.length === 0) return;
    if (compareIds.length === allIds.length) {
      setCompareIds([]);
    } else {
      setCompareIds(allIds);
    }
  };

  const comparedSchools = matches
    .map((m, idx) => {
      const s = m.school || m;
      const sId = getSchoolId(m, idx);
      return { ...s, id: sId, matchScore: m.matchScore ?? m.score ?? 0 };
    })
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
        {compareIds.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E3A8A' }}>
              {compareIds.length} Selected
            </span>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                backgroundColor: '#16A34A',
                color: '#FFFFFF',
                border: '1px solid #15803D',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              onClick={handleShareSelectedWhatsApp}
              title={`Send all ${compareIds.length} selected schools to parent via WhatsApp`}
            >
              <CrmIcon name="send" size={14} color="#FFFFFF" /> Send {compareIds.length} on WhatsApp
            </button>
            {compareIds.length >= 2 && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setShowCompareModal(true)}
              >
                Compare Selected ({compareIds.length})
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setCompareIds([])}
            >
              Deselect All
            </button>
          </div>
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
              <th style={{ width: '68px', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <input
                    type="checkbox"
                    checked={matches.length > 0 && compareIds.length === matches.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = compareIds.length > 0 && compareIds.length < matches.length;
                      }
                    }}
                    onChange={toggleSelectAll}
                    title={
                      matches.length > 0 && compareIds.length === matches.length
                        ? 'Deselect All Schools'
                        : 'Select All Schools'
                    }
                    style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 700 }}>CMP</span>
                </div>
              </th>
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
                const sId = getSchoolId(m, idx);
                const s = { ...(m.school || m), id: sId, matchScore: m.matchScore ?? m.score ?? 0 };
                const isSelected = compareIds.includes(sId);
                return (
                  <tr key={sId} style={isSelected ? { backgroundColor: '#F0F9FF' } : undefined}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCompare(sId)}
                        title={isSelected ? 'Deselect this school' : 'Select this school'}
                        style={{ cursor: 'pointer', width: '15px', height: '15px' }}
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
    body: 'Hello {parentName}! Thank you for contacting BoardingEdu for {studentName}. Our counsellor will shortly share the best boarding school options matching your budget & board preference.',
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
    'Hello {parentName}! Sharing {schoolName} boarding details for {studentName}.'
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
              <strong style={{ fontSize: '14px', color: '#0F172A', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <CrmIcon name="sparkles" size={15} color="#2563EB" /> Selected Template: {selectedTemplate.name || selectedTemplate.title}
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
