import React, { useEffect, useState, useRef } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { useAuthStore, User } from '../../stores/authStore';
import { apiCall } from '../../lib/api';
import WireframeExplorer from '../wireframes/WireframeExplorer';
import { PrivacyPolicyDocument } from '../views/PrivacyComplianceView';

type AuthView =
  | 'login'
  | 'forgot-password'
  | 'verify-otp'
  | 'create-new-password'
  | 'password-reset-success'
  | 'two-factor'
  | 'unauthorized'
  | 'wireframe-screen';

export default function LoginPage() {
  const { login } = useAuthStore();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [wireframeScreenNum, setWireframeScreenNum] = useState<number>(1);

  // Login State (MANUAL ENTRY ONLY: starts completely empty)
  const [selectedRole, setSelectedRole] = useState<'admin' | 'manager' | 'counsellor'>('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);

  // Forgot Password / OTP / Reset State
  const [forgotEmail, setForgotEmail] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // 2FA & Lockout State
  const [tempToken, setTempToken] = useState('');
  const [tfaDigits, setTfaDigits] = useState(['', '', '', '', '', '']);
  const [showRecoveryInput, setShowRecoveryInput] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [isNewDevice, setIsNewDevice] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(300);

  useEffect(() => {
    let id = localStorage.getItem('crm_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      localStorage.setItem('crm_device_id', id);
    }
    setDeviceId(id);
    // Pre-warm Render container on login screen mount so /auth/login responds with zero cold-start 502
    fetch('/api/health', { cache: 'no-store' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (authView !== 'two-factor' && authView !== 'verify-otp') return;
    if (otpExpirySeconds <= 0) return;
    const t = setInterval(() => {
      setOtpExpirySeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [authView, otpExpirySeconds]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const t = setInterval(() => {
      setLockoutSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [lockoutSeconds]);

  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const tfaRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const showToast = (text: string, type: 'success' | 'danger' | 'warning' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleRoleCardClick = (role: 'admin' | 'manager' | 'counsellor') => {
    setSelectedRole(role);
    const label = role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Counsellor';
    showToast(`${label} role selected — please enter your Email and Password manually.`, 'success');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailTrimmed = identifier.trim();

    if (!emailTrimmed) {
      showToast('Please enter your work email or employee ID.', 'danger');
      return;
    }
    if (!password) {
      showToast('Please enter your password.', 'danger');
      return;
    }

    setIsLoading(true);
    try {
      const currentDevId = deviceId || localStorage.getItem('crm_device_id') || '';
      const res = await apiCall('/auth/login', 'POST', {
        identifier: emailTrimmed,
        email: emailTrimmed,
        password,
        role: selectedRole,
        rememberMe,
        deviceId: currentDevId,
        deviceName: navigator.userAgent,
      });

      if (res.require2FA || res.requiresTwoFactor || res.requires_2fa) {
        setTempToken(res.tempToken || res.temp_token);
        setIsNewDevice(Boolean(res.isNewDevice));
        setAdminEmail(res.adminEmail || emailTrimmed || 'adminboarding123@gmail.com');
        setTfaDigits(['', '', '', '', '', '']);
        setOtpExpirySeconds(Number(res.expiresInSeconds || 300));
        if (res.lockoutSeconds) {
          setLockoutSeconds(Number(res.lockoutSeconds));
        }
        setResendCooldown(0);
        showToast(
          res.message || '5 wrong attempts reached! Verification OTP sent to your email — enter OTP to unlock & open Dashboard.',
          'warning'
        );
        setAuthView('two-factor');
        setIsLoading(false);
        return;
      }

      if (res.user) {
        const backendRole = String(res.user.backendRole || res.user.role || '').toUpperCase();
        const roleEnum: User['role'] =
          backendRole === 'SUPER_ADMIN' || backendRole === 'ADMIN'
            ? 'SUPER_ADMIN'
            : backendRole === 'SENIOR_MANAGER' || backendRole === 'MANAGER'
            ? 'SENIOR_MANAGER'
            : 'COUNSELLOR';

        const token = res.token || res.accessToken;
        login(
          {
            id: res.user.id || res.user._id,
            email: res.user.email,
            fullName: res.user.name || res.user.fullName,
            role: roleEnum,
            rawRole: res.user.backendRole || res.user.role,
            employeeId: res.user.employeeId,
          },
          token,
          res.refreshToken,
          rememberMe
        );
      }
    } catch (err: any) {
      if (err?.status === 423 || err?.status === 429 || String(err?.message || '').toLowerCase().includes('locked')) {
        const sec = Number(err?.data?.retryAfterSeconds || 900);
        setLockoutSeconds(sec > 0 ? sec : 900);
      }
      showToast(err.message || 'Invalid credentials.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanInput = forgotEmail.trim();
    if (!cleanInput) {
      showToast('Please enter your registered email address (e.g. adminboarding123@gmail.com).', 'danger');
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiCall('/auth/forgot-password', 'POST', {
        email: cleanInput,
        identifier: cleanInput,
      });
      setResolvedEmail(res.email || cleanInput);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpExpirySeconds(300);
      showToast(
        res.message || `6-digit verification OTP sent to ${res.email || cleanInput} (valid for 1 minute)!`,
        'success'
      );
      setAuthView('verify-otp');
    } catch (err: any) {
      showToast(err.message || 'Email not found or error generating OTP.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpExpirySeconds <= 0) {
      showToast('OTP has expired (1-minute limit)! Please click Resend OTP to get a new code.', 'danger');
      return;
    }
    const otp = otpDigits.join('').trim();
    if (otp.length !== 6) {
      showToast('Please enter all 6 digits of the verification OTP.', 'danger');
      return;
    }
    setIsLoading(true);
    try {
      const targetIdentifier = (resolvedEmail || forgotEmail).trim();
      const res = await apiCall('/auth/verify-otp', 'POST', {
        identifier: targetIdentifier,
        email: targetIdentifier,
        otp,
      });
      setResetToken(res.resetToken);
      showToast('OTP verified successfully! Now create and confirm your new password.', 'success');
      setAuthView('create-new-password');
    } catch (err: any) {
      showToast(err.message || 'Invalid or expired OTP. Please click Resend OTP if 1 minute has passed.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters long.', 'danger');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match. Please re-enter both identical passwords.', 'danger');
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiCall('/auth/reset-password', 'POST', {
        email: (resolvedEmail || forgotEmail || 'adminboarding123@gmail.com').trim(),
        otp: otpDigits.join('').trim(),
        resetToken,
        newPassword,
        confirmPassword,
      });
      showToast(res.message || 'Password changed and confirmed successfully!', 'success');
      setAuthView('password-reset-success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update password.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpExpirySeconds <= 0) {
      showToast('OTP has expired (1-minute limit)! Please click Resend OTP below to get a fresh 6-digit OTP.', 'danger');
      return;
    }
    const code = tfaDigits.join('').trim();
    if (code.length !== 6) {
      showToast('Please enter all 6 digits of the OTP code.', 'danger');
      return;
    }
    setIsLoading(true);
    try {
      const currentDevId = deviceId || localStorage.getItem('crm_device_id') || '';
      const res = await apiCall('/auth/verify-device-otp', 'POST', {
        tempToken: tempToken || 'demo_temp_token',
        code,
        otp: code,
        deviceId: currentDevId,
        deviceName: navigator.userAgent,
      });
      if (res.user) {
        const backendRole = String(res.user.backendRole || res.user.role || '').toUpperCase();
        const roleEnum: User['role'] =
          backendRole === 'SUPER_ADMIN' || backendRole === 'ADMIN'
            ? 'SUPER_ADMIN'
            : backendRole === 'SENIOR_MANAGER' || backendRole === 'MANAGER'
            ? 'SENIOR_MANAGER'
            : 'COUNSELLOR';
        const token = res.token || res.accessToken;
        localStorage.setItem('crm_token', token);
        login(
          {
            id: res.user.id || res.user._id,
            email: res.user.email,
            fullName: res.user.name || res.user.fullName,
            role: roleEnum,
            employeeId: res.user.employeeId,
          },
          token,
          res.refreshToken
        );
        showToast('OTP verified! Account unlocked & Dashboard opened.', 'success');
      } else {
        showToast('OTP Verified! Please sign in.', 'success');
        setAuthView('login');
      }
    } catch (err: any) {
      showToast(err.message || 'Invalid or expired OTP. Please click Resend OTP if 1 minute has elapsed.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendDeviceOtp = async () => {
    try {
      setIsLoading(true);
      const res = await apiCall('/auth/resend-device-otp', 'POST', { tempToken });
      setTfaDigits(['', '', '', '', '', '']);
      setOtpExpirySeconds(60);
      setResendCooldown(0);
      showToast(res.message || 'Fresh 6-digit OTP sent to email (valid for 1 minute)!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to resend OTP.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseBackupCodeLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = recoveryCode.trim();
    if (!code) {
      showToast('Enter an 8-character recovery code to continue.', 'danger');
      return;
    }
    try {
      const res = await apiCall('/auth/verify-2fa', 'POST', {
        tempToken,
        code,
        isRecoveryCode: true,
      });
      if (res.user) {
        const token = res.token || res.accessToken;
        const backendRole = String(res.user.backendRole || res.user.role || '').toUpperCase();
        const roleEnum: User['role'] =
          backendRole === 'SUPER_ADMIN' || backendRole === 'ADMIN'
            ? 'SUPER_ADMIN'
            : backendRole === 'SENIOR_MANAGER' || backendRole === 'MANAGER'
            ? 'SENIOR_MANAGER'
            : 'COUNSELLOR';
        login(
          {
            id: res.user.id || res.user._id,
            email: res.user.email,
            fullName: res.user.name || res.user.fullName,
            role: roleEnum,
            rawRole: res.user.backendRole || res.user.role,
            employeeId: res.user.employeeId,
          },
          token,
          res.refreshToken,
          rememberMe
        );
      }
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  // Password strength calculation for Create New Password screen
  const has8 = newPassword.length >= 8;
  const hasUpperLower = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const hasNumSpec = /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword);
  const strengthScore = (has8 ? 33 : 0) + (hasUpperLower ? 33 : 0) + (hasNumSpec ? 34 : 0);

  if (authView === 'wireframe-screen') {
    return (
      <WireframeExplorer
        screenNum={wireframeScreenNum}
        onSelectScreen={(num) => setWireframeScreenNum(num)}
        onBackToLogin={() => setAuthView('login')}
      />
    );
  }

  return (
    <>
      {/* Toast Container matching original index.html */}
      <div className="toast-container" id="toastContainer">
        {toastMsg && (
          <div className={`toast ${toastMsg.type}`}>
            <span>{toastMsg.type === 'success' ? '' : toastMsg.type === 'danger' ? <CrmIcon name="x-circle" size={15} /> : <CrmIcon name="alert" size={15} />}</span>{' '}
            <span>{toastMsg.text}</span>
          </div>
        )}
      </div>

      {authView === 'forgot-password' && (
        <div className="auth-wrapper">
          <div className="auth-card">
            {/* Official BoardingEdu Logo Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <img
                  src="/boardingedu-logo.png"
                  alt="BoardingEdu - Connecting Parents & Schools"
                  style={{
                    height: '95px',
                    width: 'auto',
                    maxWidth: '220px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
              <h1 className="auth-title" style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                Forgot Password
              </h1>
              <p className="auth-subtitle" style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                Enter your registered email address to receive an instant 6-digit verification OTP on your Gmail.
              </p>
            </div>

            <div
              style={{
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                padding: '9px 12px',
                borderRadius: '10px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                color: '#1D4ED8',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              <span><CrmIcon name="mail" size={16} /> Email Verification</span>
            </div>

            <form onSubmit={handleForgotPasswordSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  Registered Work Email <span className="req">*</span>
                </label>
                <input
                  type="email"
                  id="forgotEmail"
                  className="form-control"
                  placeholder="e.g. adminboarding123@gmail.com"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                />
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '6px' }}>
                  <CrmIcon name="mail" size={16} /> 6-digit verification OTP will arrive immediately in your Gmail inbox.
                </div>
              </div>

              <button
                type="submit"
                id="btnForgot"
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Sending Verification OTP...' : 'Send Email Verification OTP'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <a
                href="#login"
                onClick={(e) => {
                  e.preventDefault();
                  setAuthView('login');
                }}
                style={{
                  color: '#2563EB',
                  fontSize: '13px',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                ← Back to Login
              </a>
            </div>
          </div>
        </div>
      )}

      {authView === 'verify-otp' && (
        <div className="auth-wrapper">
          <div className="auth-card">
            {/* Official BoardingEdu Logo Header */}
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <img
                  src="/boardingedu-logo.png"
                  alt="BoardingEdu - Connecting Parents & Schools"
                  style={{
                    height: '90px',
                    width: 'auto',
                    maxWidth: '220px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
              <h1 className="auth-title" style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                Enter OTP Verification Code
              </h1>
              <p className="auth-subtitle" style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                Please enter the 6-digit verification code sent to your registered email address.
              </p>
            </div>

            {/* Live Email Notification Card */}
            <div
              style={{
                background: 'linear-gradient(135deg, #F0FDF4 0%, #EFF6FF 100%)',
                border: '1px solid #BBF7D0',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '18px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '16px' }}><CrmIcon name="mail" size={16} /></span>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#166534' }}>
                  Email Verification Code Sent
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    background: '#22C55E',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    letterSpacing: '0.5px',
                  }}
                >
                  SENT
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6 }}>
                <div>
                  <strong>Email:</strong> {resolvedEmail || forgotEmail || 'adminboarding123@gmail.com'}
                </div>
                <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#15803D', fontWeight: 600 }}>
                  <CrmIcon name="mail" size={16} /> Please check your Gmail app ({resolvedEmail || 'adminboarding123@gmail.com'}) on your phone and enter the 6-digit OTP below.
                </div>
              </div>
            </div>

            <form onSubmit={handleVerifyOtpSubmit}>
              <div className="otp-inputs" style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '14px' }}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={otpRefs[idx]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="otp-box"
                    value={digit}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace') {
                        if (!digit && idx > 0) {
                          otpRefs[idx - 1].current?.focus();
                        }
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                      if (pasted) {
                        const next = [...otpDigits];
                        for (let i = 0; i < 6; i++) {
                          next[i] = pasted[i] || '';
                        }
                        setOtpDigits(next);
                        const nextIdx = Math.min(pasted.length, 5);
                        otpRefs[nextIdx].current?.focus();
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      const next = [...otpDigits];
                      next[idx] = val.slice(-1);
                      setOtpDigits(next);
                      if (val && idx < 5) {
                        otpRefs[idx + 1].current?.focus();
                      }
                    }}
                    style={{
                      width: '46px',
                      height: '52px',
                      textAlign: 'center',
                      fontSize: '22px',
                      fontWeight: 800,
                      borderRadius: '8px',
                      border: digit ? '2px solid #2563EB' : '1.5px solid #CBD5E1',
                      background: digit ? '#EFF6FF' : '#FFFFFF',
                      color: '#0F172A',
                      outline: 'none',
                    }}
                  />
                ))}
              </div>

              <div
                style={{
                  textAlign: 'center',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginBottom: '18px',
                }}
              >
                <CrmIcon name="clock" size={16} />{' '}
                {otpExpirySeconds > 0 ? (
                  <>
                    OTP valid for{' '}
                    <span style={{ color: 'var(--warning)', fontWeight: 800 }}>
                      00:{String(otpExpirySeconds).padStart(2, '0')}s
                    </span>{' '}
                    (1-minute limit)
                  </>
                ) : (
                  <span style={{ color: '#DC2626', fontWeight: 800 }}>
                    OTP Expired (1 minute over)! Please click Resend OTP below.
                  </span>
                )}
              </div>

              <button
                type="submit"
                id="btnVerifyOTP"
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  opacity: otpExpirySeconds <= 0 ? 0.6 : 1,
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                }}
                disabled={isLoading || otpExpirySeconds <= 0}
              >
                {isLoading ? 'Verifying OTP...' : 'Verify OTP & Proceed'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={isLoading}
                onClick={() => handleForgotPasswordSubmit()}
                style={{
                  fontSize: '12px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  background: otpExpirySeconds <= 0 ? '#EFF6FF' : undefined,
                  borderColor: otpExpirySeconds <= 0 ? '#2563EB' : undefined,
                  color: otpExpirySeconds <= 0 ? '#1D4ED8' : undefined,
                }}
              >
                <CrmIcon name="refresh-cw" size={13} /> Resend Fresh OTP (1-Min Timer)
              </button>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  setAuthView('forgot-password');
                }}
                style={{ color: '#2563EB', fontSize: '13px', textDecoration: 'none', fontWeight: 600 }}
              >
                ← Change Email Address
              </a>
            </div>
          </div>
        </div>
      )}

      {authView === 'create-new-password' && (
        <div className="auth-wrapper">
          <div className="auth-card">
            {/* Official BoardingEdu Logo Header */}
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <img
                  src="/boardingedu-logo.png"
                  alt="BoardingEdu - Connecting Parents & Schools"
                  style={{
                    height: '90px',
                    width: 'auto',
                    maxWidth: '220px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
              <h1 className="auth-title" style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                Create New Password
              </h1>
              <p className="auth-subtitle" style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                Set a strong secure password for your BoardingEdu account.
              </p>
            </div>

            <form onSubmit={handleCreateNewPasswordSubmit}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  New Password <span className="req">*</span>
                </label>
                <div className="input-with-action" style={{ position: 'relative' }}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    id="resetNewPass"
                    className="form-control"
                    placeholder="Enter new strong password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ padding: '10px 40px 10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px', width: '100%' }}
                  />
                  <button
                    type="button"
                    className="input-action-btn"
                    onClick={() => setShowNewPass(!showNewPass)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                    }}
                  >
                    {showNewPass ? <CrmIcon name="eye-off" size={15} /> : <CrmIcon name="eye" size={15} />}
                  </button>
                </div>
              </div>

              <div className="password-strength-bar" style={{ height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
                <div
                  id="strengthFill"
                  className="password-strength-fill"
                  style={{
                    height: '100%',
                    width: `${strengthScore}%`,
                    transition: 'all 0.3s ease',
                    background:
                      strengthScore === 100
                        ? 'var(--success)'
                        : strengthScore > 50
                        ? 'var(--warning)'
                        : 'var(--danger)',
                  }}
                />
              </div>

              <div className="password-requirements" style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px', fontSize: '12px' }}>
                <div className={`req-item ${has8 ? 'valid' : ''}`} style={{ color: has8 ? '#15803D' : '#64748B', marginBottom: '3px' }}>
                  <span>{has8 ? <CrmIcon name="check-circle" size={15} /> : <CrmIcon name="moon" size={15} />}</span> Min 8 characters
                </div>
                <div className={`req-item ${hasUpperLower ? 'valid' : ''}`} style={{ color: hasUpperLower ? '#15803D' : '#64748B', marginBottom: '3px' }}>
                  <span>{hasUpperLower ? <CrmIcon name="check-circle" size={15} /> : <CrmIcon name="moon" size={15} />}</span> At least 1 Uppercase &amp; 1 Lowercase letter
                </div>
                <div className={`req-item ${hasNumSpec ? 'valid' : ''}`} style={{ color: hasNumSpec ? '#15803D' : '#64748B' }}>
                  <span>{hasNumSpec ? <CrmIcon name="check-circle" size={15} /> : <CrmIcon name="moon" size={15} />}</span> At least 1 Number &amp; 1 Special char (@$!%*?&amp;)
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  Confirm New Password <span className="req">*</span>
                </label>
                <div className="input-with-action" style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    id="resetConfirmPass"
                    className="form-control"
                    placeholder="Re-enter new password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ padding: '10px 40px 10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px', width: '100%' }}
                  />
                  <button
                    type="button"
                    className="input-action-btn"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                    }}
                  >
                    {showConfirmPass ? <CrmIcon name="eye-off" size={15} /> : <CrmIcon name="eye" size={15} />}
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#92400E',
                  marginBottom: '16px',
                }}
              >
                <CrmIcon name="lock" size={16} /> <strong>Security Policy:</strong> Saving will update your password in PostgreSQL and revoke all existing active sessions.
              </div>

              <button
                type="submit"
                id="btnSetNewPass"
                className="btn btn-success"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  background: '#16A34A',
                  border: 'none',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Updating Password...' : 'Confirm & Change Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {authView === 'password-reset-success' && (
        <div className="auth-wrapper">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            {/* Official BoardingEdu Logo Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '15px',
              }}
            >
              <img
                src="/boardingedu-logo.png"
                alt="BoardingEdu - Connecting Parents & Schools"
                style={{
                  height: '90px',
                  width: 'auto',
                  maxWidth: '220px',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}><CrmIcon name="sparkles" size={16} /></div>
            <h1 className="auth-title" style={{ color: '#16A34A', fontSize: '22px', fontWeight: 800 }}>
              Password Changed &amp; Confirmed!
            </h1>
            <p className="auth-subtitle" style={{ marginTop: '8px', fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>
              Your new password has been securely updated and confirmed in the database. You can now sign in with your new password.
            </p>

            <button
              className="btn btn-primary"
              style={{
                marginTop: '20px',
                padding: '12px 28px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '14px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
              onClick={() => {
                setIdentifier(forgotEmail || 'adminboarding123@gmail.com');
                setPassword('');
                setAuthView('login');
              }}
            >
              <CrmIcon name="rocket" size={16} /> Proceed to Sign In with New Password
            </button>
          </div>
        </div>
      )}

      {authView === 'two-factor' && (
        <div className="auth-wrapper">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div
              className="auth-logo"
              style={{ background: 'linear-gradient(135deg, var(--primary-navy), #2563EB)' }}
            >
              <CrmIcon name="shield" size={16} />
            </div>
            <h1 className="auth-title">
              Account Unlock &amp; OTP Verification
            </h1>
            <p className="auth-subtitle">
              5 failed login attempts reached. Enter the 6-digit OTP sent to your email to unlock your account and open the Dashboard.
            </p>

            {lockoutSeconds > 0 && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  marginBottom: '12px',
                }}
              >
                <CrmIcon name="lock" size={14} /> Account Lock Timer:{' '}
                <strong>
                  {Math.floor(lockoutSeconds / 60)}m {String(lockoutSeconds % 60).padStart(2, '0')}s
                </strong>{' '}
                (Verify OTP below to unlock immediately)
              </div>
            )}

            <div
              style={{
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '18px',
                textAlign: 'left',
                fontSize: '12px',
                color: '#1E40AF',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CrmIcon name="shield" size={14} /> Email OTP Sent
              </div>
              <div style={{ color: '#1E3A8A', fontSize: '13px' }}>
                OTP sent to: <strong>{adminEmail && !adminEmail.includes('@crm.edu') ? adminEmail : 'adminboarding123@gmail.com'}</strong>
              </div>
              <div style={{ color: '#64748B', fontSize: '11px', marginTop: '6px', lineHeight: 1.5 }}>
                Please check your email inbox (or spam folder) for the 6-digit OTP code and enter it below to unlock and open your Dashboard.
              </div>
            </div>

            <form onSubmit={handle2FASubmit}>
              <div className="otp-inputs">
                {tfaDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={tfaRefs[idx]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="otp-box"
                    value={digit}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                      if (pasted) {
                        const next = [...tfaDigits];
                        for (let i = 0; i < 6; i++) {
                          next[i] = pasted[i] || '';
                        }
                        setTfaDigits(next);
                        const nextIdx = Math.min(pasted.length, 5);
                        tfaRefs[nextIdx].current?.focus();
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      const next = [...tfaDigits];
                      next[idx] = val.slice(-1);
                      setTfaDigits(next);
                      if (val && idx < 5) tfaRefs[idx + 1].current?.focus();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !digit && idx > 0) {
                        tfaRefs[idx - 1].current?.focus();
                      }
                    }}
                  />
                ))}
              </div>

              <div
                style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}
              >
                <CrmIcon name="clock" size={16} />{' '}
                {otpExpirySeconds > 0 ? (
                  <span style={{ color: 'var(--warning)', fontWeight: 800 }}>
                    OTP valid for 00:{String(otpExpirySeconds).padStart(2, '0')}s (1 minute only)
                  </span>
                ) : (
                  <span style={{ color: '#DC2626', fontWeight: 800 }}>
                    OTP Expired (1 minute over)! Please click Resend OTP below.
                  </span>
                )}
              </div>

              <button
                type="submit"
                id="btn2FASubmit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px', fontWeight: 700, opacity: otpExpirySeconds <= 0 ? 0.6 : 1 }}
                disabled={isLoading || otpExpirySeconds <= 0}
              >
                <CrmIcon name="check-circle" size={16} /> {isNewDevice ? 'Verify OTP & Open Dashboard' : 'Verify & Grant Dashboard Access'}
              </button>
            </form>

            {isNewDevice ? (
              <div style={{ marginTop: '14px' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={isLoading}
                  onClick={handleResendDeviceOtp}
                  style={{
                    fontSize: '12px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    background: otpExpirySeconds <= 0 ? '#EFF6FF' : undefined,
                    borderColor: otpExpirySeconds <= 0 ? '#2563EB' : undefined,
                    color: otpExpirySeconds <= 0 ? '#1D4ED8' : undefined,
                  }}
                >
                  <CrmIcon name="refresh-cw" size={13} /> Resend Fresh OTP (1-Min Timer)
                </button>
              </div>
            ) : (
              <div style={{ marginTop: '16px' }}>
                {!showRecoveryInput ? (
                  <a
                    href="#recovery"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowRecoveryInput(true);
                    }}
                    style={{ fontSize: '12px', color: 'var(--primary-blue)', fontWeight: 600 }}
                  >
                    Use 8-Character Recovery Code instead →
                  </a>
                ) : (
                  <form
                    onSubmit={handleUseBackupCodeLogin}
                    style={{
                      background: '#F8FAFC',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      textAlign: 'left',
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '6px' }}>
                      Backup Recovery Code
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. UK26-A1B2-C3D4"
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value)}
                      />
                      <button type="submit" className="btn btn-primary btn-sm">
                        Verify
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <div style={{ marginTop: '18px' }}>
              <a
                href="#login"
                onClick={(e) => {
                  e.preventDefault();
                  setAuthView('login');
                }}
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '11.5px',
                  textDecoration: 'none',
                }}
              >
                ← Cancel &amp; Back to Login
              </a>
            </div>
          </div>
        </div>
      )}

      {authView === 'unauthorized' && (
        <div className="auth-wrapper">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '12px' }}><CrmIcon name="ban" size={16} /></div>
            <h1 className="auth-title" style={{ color: 'var(--danger)' }}>
              403 – Unauthorized Access
            </h1>
            <p className="auth-subtitle" style={{ marginTop: '8px' }}>
              You do not have permission to access the requested resource or role dashboard. The
              backend Role-Based Access Control (RBAC) engine blocked this request.
            </p>

            <button
              className="btn btn-navy"
              style={{ marginTop: '24px' }}
              onClick={() => setAuthView('login')}
            >
              ← Return to Login
            </button>
          </div>
        </div>
      )}

      {authView === 'login' && (
        <div className="auth-wrapper">
          <div className="auth-card">
            {/* Official BoardingEdu Logo Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <img
                  src="/boardingedu-logo.png"
                  alt="BoardingEdu - Connecting Parents & Schools"
                  style={{
                    height: '115px',
                    width: 'auto',
                    maxWidth: '260px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
              <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>
                Login to Your Account
              </p>
            </div>

            {lockoutSeconds > 0 && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '14px',
                }}
              >
                <CrmIcon name="lock" size={16} /> Account temporarily locked due to failed attempts. Retry in{' '}
                <strong>
                  {Math.floor(lockoutSeconds / 60)}m {String(lockoutSeconds % 60).padStart(2, '0')}s
                </strong>
                .
              </div>
            )}

            <form onSubmit={handleLoginSubmit}>
              <input type="hidden" id="loginRole" value={selectedRole} />

              {/* Email or Mobile Number Field */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  Email Address
                </label>
                <div className="auth-input-container">
                  <span className="auth-input-icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#8C9BAE"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                    </svg>
                  </span>
                  <input
                    type="email"
                    id="loginIdentifier"
                    placeholder="adminboarding123@gmail.com"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  Password
                </label>
                <div className="auth-input-container">
                  <span className="auth-input-icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#8C9BAE"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="loginPassword"
                    placeholder="••••••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    title="Show/Hide Password"
                    aria-label="Toggle password visibility"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={showPassword ? '#2563EB' : '#8C9BAE'}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password Row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: '#64748B',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    id="loginRememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: '#2563EB',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                  />
                  <span>Remember me</span>
                </label>
                <a
                  href="#forgot-password"
                  onClick={(e) => {
                    e.preventDefault();
                    setForgotEmail(identifier.trim() || 'adminboarding123@gmail.com');
                    setAuthView('forgot-password');
                  }}
                  style={{
                    color: '#2563EB',
                    fontSize: '13px',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Forgot password?
                </a>
              </div>

              {/* Login Button */}
              <button type="submit" id="btnLogin" className="auth-btn-primary" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Login'}
              </button>
            </form>

            {/* Divider: Login with Role */}
            <div className="auth-role-divider">
              <span>Login with Role</span>
            </div>

            {/* Role Selection Cards */}
            <div className="auth-role-grid">
              {/* Admin Card */}
              <div
                id="roleCard-admin"
                className={`auth-role-card admin ${selectedRole === 'admin' ? 'selected' : ''}`}
                onClick={() => handleRoleCardClick('admin')}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <circle cx="18" cy="15" r="2.5"></circle>
                </svg>
                <span className="role-title">Admin</span>
              </div>

              {/* Manager Card */}
              <div
                id="roleCard-manager"
                className={`auth-role-card manager ${selectedRole === 'manager' ? 'selected' : ''}`}
                onClick={() => handleRoleCardClick('manager')}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span className="role-title">Manager</span>
              </div>

              {/* Counsellor Card */}
              <div
                id="roleCard-counsellor"
                className={`auth-role-card counsellor ${
                  selectedRole === 'counsellor' ? 'selected' : ''
                }`}
                onClick={() => handleRoleCardClick('counsellor')}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span className="role-title">Counsellor</span>
              </div>
            </div>

            {/* Footer Links: Change Password & Privacy Policy */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '20px',
                marginTop: '22px',
                fontSize: '12.5px',
              }}
            >
              <a
                href="#change-password"
                onClick={(e) => {
                  e.preventDefault();
                  setAuthView('forgot-password');
                }}
                style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}
              >
                Change Password
              </a>
              <a
                href="#privacy-policy"
                onClick={(e) => {
                  e.preventDefault();
                  setShowPrivacyModal(true);
                }}
                style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}
              >
                Privacy Policy
              </a>
            </div>
          </div>
        </div>
      )}

      {showPrivacyModal && (
        <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setShowPrivacyModal(false)}>
          <div className="modal-content" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                📜 BoardingEdu Privacy Policy &amp; DPDP Compliance
              </h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowPrivacyModal(false)}>
                <CrmIcon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <PrivacyPolicyDocument />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setShowPrivacyModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
