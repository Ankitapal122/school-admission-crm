import React, { useEffect, useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

interface UserProfileData {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  employeeId: string;
  canonicalRole: string;
  backendRole?: string;
  status?: string;
  team?: {
    id: string;
    name: string;
    teamCode?: string;
  } | null;
  manager?: {
    id: string;
    fullName: string;
    email?: string;
  } | null;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
  upiId?: string;
  isTwoFactorEnabled?: boolean;
  lastLoginAt?: string;
  passwordUpdatedAt?: string;
}

export function UserProfileView({
  onShowToast,
  isSettingsMode = false,
}: {
  onShowToast: (m: string, t?: 'success' | 'danger' | 'warning') => void;
  isSettingsMode?: boolean;
}) {
  const { user, setUser } = useAuthStore();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editUpiId, setEditUpiId] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Load profile from /users/me
  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const res = await apiCall('/users/me');
      const data = res?.user || res?.data?.user || res?.data || res;
      if (data) {
        setProfile(data);
        setEditFullName(data.fullName || user?.fullName || '');
        setEditPhone(data.phone || user?.phone || '');
        setEditUpiId(data.upiId || '');

        // Sync back with authStore
        setUser({
          ...user,
          ...data,
          role: user?.role || data.canonicalRole || 'COUNSELLOR',
        });
      }
    } catch {
      // Fallback to authStore user if network fails
      if (user) {
        setProfile({
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone || '',
          employeeId: user.employeeId,
          canonicalRole: user.role,
          backendRole: user.rawRole,
          status: user.status || 'active',
          team: user.teamName ? { id: user.teamId || '', name: user.teamName } : null,
          lastLoginAt: user.lastLoginAt,
        });
        setEditFullName(user.fullName || '');
        setEditPhone(user.phone || '');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // Save profile updates (Name, Phone, UPI)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFullName.trim()) {
      onShowToast('Full Name cannot be empty.', 'warning');
      return;
    }
    if (editPhone.trim() && !/^\d{10}$/.test(editPhone.replace(/\D/g, '').slice(-10))) {
      onShowToast('Please enter a valid 10-digit mobile number.', 'warning');
      return;
    }

    setIsSavingProfile(true);
    try {
      const cleanPhone = editPhone.trim() ? editPhone.replace(/\D/g, '').slice(-10) : '';
      const res = await apiCall('/users/me', 'PUT', {
        fullName: editFullName.trim(),
        phone: cleanPhone,
        upiId: editUpiId.trim(),
      });
      const updated = res?.user || res?.data?.user || res?.data || res;

      setProfile((prev) => (prev ? { ...prev, ...updated, fullName: editFullName.trim(), phone: cleanPhone } : updated));

      if (user) {
        setUser({
          ...user,
          fullName: editFullName.trim(),
          phone: cleanPhone,
        });
      }

      setIsEditing(false);
      onShowToast('Profile updated successfully!', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update profile.', 'danger');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      onShowToast('Please enter your current password.', 'warning');
      return;
    }
    if (!newPassword) {
      onShowToast('Please enter a new password.', 'warning');
      return;
    }
    if (newPassword.length < 8) {
      onShowToast('New password must be at least 8 characters long.', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      onShowToast('New password and confirm password do not match.', 'danger');
      return;
    }

    setIsChangingPass(true);
    try {
      await apiCall('/users/me/password', 'PUT', {
        currentPassword,
        newPassword,
      });
      onShowToast('Password changed successfully! Please use your new password next time.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to change password.', 'danger');
    } finally {
      setIsChangingPass(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'CO';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const displayName = profile?.fullName || user?.fullName || 'User Profile';
  const displayEmail = profile?.email || user?.email || '—';
  const displayPhone = profile?.phone || user?.phone || 'Not added yet';
  const displayEmpId = profile?.employeeId || user?.employeeId || 'EMP-COU-004';
  const formatRoleLabel = (r?: string) => {
    const clean = String(r || '').toLowerCase().replace(/_/g, ' ');
    if (clean.includes('super') || clean.includes('admin')) return 'Super Admin';
    if (clean.includes('manager')) return 'Senior Manager';
    if (clean.includes('counsellor')) return 'Counsellor (Admissions)';
    return 'Counsellor';
  };
  const displayRole = formatRoleLabel(profile?.canonicalRole || profile?.backendRole || user?.role);
  const displayTeam = profile?.team?.name || user?.teamName || 'General Counselling Team';
  const displayStatus = profile?.status || user?.status || 'Active';

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Top Banner / Hero Profile Card */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #1E3A8A 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#FFFFFF',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3B82F6 0%, #EC4899 100%)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  fontWeight: 800,
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                  border: '3px solid rgba(255, 255, 255, 0.5)',
                }}
              >
                {getInitials(displayName)}
              </div>
              <span
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  right: '2px',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: '#22C55E',
                  border: '2px solid #0F172A',
                }}
                title="Account Status: Active"
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#FFFFFF' }}>
                  {displayName}
                </h2>
                <span
                  style={{
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: '#4ADE80',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  🟢 {displayStatus}
                </span>
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.2)',
                    color: '#93C5FD',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {displayEmpId}
                </span>
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: '#94A3B8',
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  <strong style={{ color: '#E2E8F0' }}>Designation:</strong> {displayRole}
                </span>
                <span>•</span>
                <span>
                  <strong style={{ color: '#E2E8F0' }}>Team:</strong> {displayTeam}
                </span>
                <span>•</span>
                <span>
                  <strong style={{ color: '#E2E8F0' }}>Reporting Manager:</strong>{' '}
                  <span style={{ color: profile?.managerName || user?.managerName ? '#86EFAC' : '#94A3B8', fontWeight: 700 }}>
                    {profile?.managerName || user?.managerName || 'Unassigned'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <button
            className={`btn ${isEditing ? 'btn-outline' : 'btn-primary'} btn-sm`}
            onClick={() => setIsEditing(!isEditing)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              borderRadius: '8px',
              fontWeight: 600,
            }}
          >
            <CrmIcon name={isEditing ? 'x' : 'edit'} size={15} />
            <span>{isEditing ? 'Cancel Edit' : 'Edit Profile'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Details + Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Card 1: Personal & Contact Information */}
        <div className="card" style={{ padding: '20px', borderRadius: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  background: '#EFF6FF',
                  color: '#2563EB',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CrmIcon name="user" size={17} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1E293B' }}>
                Personal Details
              </h3>
            </div>
            {isEditing && (
              <span style={{ fontSize: '11px', color: '#3B82F6', fontWeight: 600 }}>
                Editing Mode Active
              </span>
            )}
          </div>

          {isEditing ? (
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Enter full name"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Mobile / Phone Number *
                </label>
                <input
                  type="tel"
                  className="form-control"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  maxLength={13}
                />
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>
                  Used for OTP verification, WhatsApp alerts, and team communication.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Email Address (Primary Login ID)
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={displayEmail}
                  disabled
                  style={{ background: '#F1F5F9', color: '#64748B', cursor: 'not-allowed' }}
                />
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>
                  Primary email is locked for security. Contact admin to change email.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  UPI ID (For Commission Payouts)
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editUpiId}
                  onChange={(e) => setEditUpiId(e.target.value)}
                  placeholder="e.g. suman@okhdfcbank"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={isSavingProfile}
                  style={{ flex: 1 }}
                >
                  <CrmIcon name="check" size={15} />
                  <span>{isSavingProfile ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Full Name */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Full Name</span>
                <span style={{ fontSize: '13.5px', color: '#0F172A', fontWeight: 700 }}>{displayName}</span>
              </div>

              {/* Email Address */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Email Address</span>
                <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {displayEmail}
                  <span style={{ color: '#16A34A', fontSize: '11px', background: '#DCFCE7', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    Verified
                  </span>
                </span>
              </div>

              {/* Mobile Number */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Mobile Number</span>
                <span style={{ fontSize: '13.5px', color: '#0F172A', fontWeight: 700 }}>
                  {displayPhone ? `+91 ${displayPhone}` : '—'}
                </span>
              </div>

              {/* Employee ID */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Employee ID</span>
                <span style={{ fontSize: '13.5px', color: '#2563EB', fontWeight: 800 }}>{displayEmpId}</span>
              </div>

              {/* Official Role */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Official Role</span>
                <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>{displayRole}</span>
              </div>

              {/* Assigned Team */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Assigned Team</span>
                <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>{displayTeam}</span>
              </div>

              {/* Reporting Manager */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>Reporting Manager</span>
                <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {profile?.managerName || user?.managerName || 'Unassigned'}
                  {(profile?.managerEmail || user?.managerEmail) && (
                    <span style={{ color: '#64748B', fontSize: '11.5px', fontWeight: 500 }}>
                      ({profile?.managerEmail || user?.managerEmail})
                    </span>
                  )}
                </span>
              </div>

              {/* UPI ID */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>UPI ID (Payouts)</span>
                <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>
                  {profile?.upiId || 'Not registered'}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setIsEditing(true)}
                style={{ marginTop: '6px', width: '100%' }}
              >
                <CrmIcon name="edit" size={14} />
                <span>Update Mobile No. / Name</span>
              </button>
            </div>
          )}
        </div>

        {/* Card 2: Security & Password Settings */}
        <div className="card" style={{ padding: '20px', borderRadius: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '12px',
            }}
          >
            <div
              style={{
                background: '#FEF2F2',
                color: '#DC2626',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CrmIcon name="lock" size={17} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1E293B' }}>
                Password &amp; Security
              </h3>
            </div>
          </div>

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Current Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  className="form-control"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                  }}
                >
                  <CrmIcon name={showCurrentPass ? 'eye-off' : 'eye'} size={15} />
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                New Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  className="form-control"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters with Uppercase, Lowercase & Number"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                  }}
                >
                  <CrmIcon name={showNewPass ? 'eye-off' : 'eye'} size={15} />
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Confirm New Password *
              </label>
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isChangingPass}
              style={{ marginTop: '8px' }}
            >
              <CrmIcon name="key" size={15} />
              <span>{isChangingPass ? 'Updating Password...' : 'Update Password'}</span>
            </button>
          </form>

          <div
            style={{
              marginTop: '16px',
              padding: '10px 12px',
              background: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              fontSize: '11.5px',
              color: '#64748B',
              lineHeight: 1.5,
            }}
          >
            🔒 <strong>Account Security Tip:</strong> Never share your password or OTP with anyone. Your session will remain valid on this device for 7 days.
          </div>
        </div>
      </div>
    </div>
  );
}
