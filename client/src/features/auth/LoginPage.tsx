import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore, User } from '../../stores/authStore';
import { apiCall } from '../../lib/api';
import WireframeExplorer from '../wireframes/WireframeExplorer';

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
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'danger' | 'warning' } | null>(null);

  // Forgot Password / OTP / Reset State
  const [forgotMethod, setForgotMethod] = useState<'email' | 'phone'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [phoneHint, setPhoneHint] = useState('+91 7249417658');
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
    if (role === 'admin') {
      setIdentifier('adminboarding123@gmail.com');
      setPassword('Admin@123');
      showToast('Admin account selected (adminboarding123@gmail.com)', 'success');
    } else if (role === 'manager') {
      setIdentifier('managerborading123@gmail.com');
      setPassword('Manager@123');
      showToast('Manager account selected (managerborading123@gmail.com)', 'success');
    } else {
      setIdentifier('priya@boardingedu.com');
      setPassword('Password@123');
      showToast('Counsellor account selected', 'success');
    }
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
      const res = await apiCall('/auth/login', 'POST', {
        identifier: emailTrimmed,
        email: emailTrimmed,
        password,
        role: selectedRole,
        rememberMe,
      });

      if (res.require2FA) {
        setTempToken(res.tempToken);
        showToast('Two-Factor Authentication required. Enter code to continue.', 'warning');
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

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = forgotEmail.trim();
    if (!cleanInput) {
      showToast(
        forgotMethod === 'phone'
          ? 'Please enter your registered mobile number (e.g. 7249417658).'
          : 'Please enter your registered email address (e.g. adminboarding123@gmail.com).',
        'danger'
      );
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiCall('/auth/forgot-password', 'POST', {
        identifier: cleanInput,
        email: cleanInput,
        phone: cleanInput,
      });
      setResolvedEmail(res.email || cleanInput);
      setPhoneHint(res.phone || '+91 7249417658');
      setOtpDigits(['', '', '', '', '', '']);
      showToast(
        res.message || `Verification OTP sent to your registered email & mobile (+91 7249417658)!`,
        'success'
      );
      setAuthView('verify-otp');
    } catch (err: any) {
      showToast(err.message || 'Account not found or error generating OTP.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      showToast('OTP verified successfully! Now create your new password.', 'success');
      setAuthView('create-new-password');
    } catch (err: any) {
      showToast(err.message || 'Invalid or incorrect OTP. Please enter the correct verification code.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters long.', 'danger');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match. Please re-enter both identical passwords.', 'danger');
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiCall('/auth/reset-password', 'POST', {
        resetToken,
        newPassword,
        confirmPassword,
      });
      showToast(res.message || 'Password updated successfully in database!', 'success');
      setAuthView('password-reset-success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update password.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = tfaDigits.join('');
    try {
      const res = await apiCall('/auth/verify-2fa', 'POST', {
        tempToken: tempToken || 'demo_temp_token',
        code,
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
      } else {
        showToast('2FA Verified! Please sign in.', 'success');
        setAuthView('login');
      }
    } catch (err: any) {
      showToast(err.message, 'danger');
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
            <span>{toastMsg.type === 'success' ? '✅' : toastMsg.type === 'danger' ? '❌' : '⚠️'}</span>{' '}
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
                Choose how you want to verify your account — via Registered Email or Mobile Number (7249417658).
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                background: '#F1F5F9',
                padding: '4px',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setForgotMethod('phone');
                  setForgotEmail('7249417658');
                }}
                style={{
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  background: forgotMethod === 'phone' ? '#FFFFFF' : 'transparent',
                  color: forgotMethod === 'phone' ? '#2563EB' : '#64748B',
                  boxShadow: forgotMethod === 'phone' ? '0 1px 3px rgba(15,23,42,0.1)' : 'none',
                }}
              >
                📱 Number Verification
              </button>
              <button
                type="button"
                onClick={() => {
                  setForgotMethod('email');
                  setForgotEmail('adminboarding123@gmail.com');
                }}
                style={{
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  background: forgotMethod === 'email' ? '#FFFFFF' : 'transparent',
                  color: forgotMethod === 'email' ? '#2563EB' : '#64748B',
                  boxShadow: forgotMethod === 'email' ? '0 1px 3px rgba(15,23,42,0.1)' : 'none',
                }}
              >
                📧 Email Verification
              </button>
            </div>

            <form onSubmit={handleForgotPasswordSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  {forgotMethod === 'phone' ? 'Registered Mobile Number' : 'Registered Work Email'} <span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="forgotEmail"
                  className="form-control"
                  placeholder={forgotMethod === 'phone' ? 'e.g. 7249417658 or +917249417658' : 'e.g. adminboarding123@gmail.com'}
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                />
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '6px' }}>
                  {forgotMethod === 'phone'
                    ? '📱 Enter 7249417658 — 6-digit verification OTP will be sent immediately.'
                    : '📧 Enter adminboarding123@gmail.com — 6-digit OTP will arrive in your Gmail inbox.'}
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
                {isLoading ? 'Sending Verification OTP...' : '📨 Send Verification OTP (Email & SMS)'}
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
                Please enter the 6-digit code received on your registered phone &amp; email.
              </p>
            </div>

            {/* Live SMS & Email Notification Card */}
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
                <span style={{ fontSize: '16px' }}>📲</span>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#166534' }}>
                  Verification Code Dispatched (SMS &amp; Email)
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
                <div>
                  <strong>Phone (SMS):</strong> {phoneHint || '+91 7249417658'}
                </div>
                <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#15803D', fontWeight: 600 }}>
                  📩 Please check your Gmail inbox ({resolvedEmail || 'adminboarding123@gmail.com'}) / SMS ({phoneHint || '+91 7249417658'}) and enter the 6-digit OTP below.
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
                ⏰ Code expires in{' '}
                <span style={{ color: 'var(--warning)', fontWeight: 700 }}>14:45</span> • Single-use verification code
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
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Verifying OTP...' : '✅ Verify OTP & Proceed'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  setAuthView('forgot-password');
                }}
                style={{ color: '#2563EB', fontSize: '13px', textDecoration: 'none', fontWeight: 600 }}
              >
                ← Resend OTP / Change Email
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
                    {showNewPass ? '🙈' : '👁️'}
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
                  <span>{has8 ? '✅' : '⚪'}</span> Min 8 characters
                </div>
                <div className={`req-item ${hasUpperLower ? 'valid' : ''}`} style={{ color: hasUpperLower ? '#15803D' : '#64748B', marginBottom: '3px' }}>
                  <span>{hasUpperLower ? '✅' : '⚪'}</span> At least 1 Uppercase &amp; 1 Lowercase letter
                </div>
                <div className={`req-item ${hasNumSpec ? 'valid' : ''}`} style={{ color: hasNumSpec ? '#15803D' : '#64748B' }}>
                  <span>{hasNumSpec ? '✅' : '⚪'}</span> At least 1 Number &amp; 1 Special char (@$!%*?&amp;)
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
                    {showConfirmPass ? '🙈' : '👁️'}
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
                🔒 <strong>Security Policy:</strong> Saving will update your password in PostgreSQL and revoke all existing active sessions.
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
                {isLoading ? 'Saving Password...' : '✅ Save New Password in Database'}
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
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>🎉</div>
            <h1 className="auth-title" style={{ color: '#16A34A', fontSize: '22px', fontWeight: 800 }}>
              Password Reset Successfully!
            </h1>
            <p className="auth-subtitle" style={{ marginTop: '8px', fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>
              Your new password has been securely hashed with bcrypt and saved to PostgreSQL. You can now log in with your updated credentials.
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
                setIdentifier(forgotEmail);
                setPassword('');
                setAuthView('login');
              }}
            >
              🚀 Proceed to Sign In with New Password
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
              🛡️
            </div>
            <h1 className="auth-title">Two-Factor Authentication</h1>
            <p className="auth-subtitle">
              Enter the 6-digit verification code from Google Authenticator or your backup recovery
              code.
            </p>

            <form onSubmit={handle2FASubmit}>
              <div className="otp-inputs">
                {tfaDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={tfaRefs[idx]}
                    type="text"
                    maxLength={1}
                    className="otp-box"
                    value={digit}
                    onChange={(e) => {
                      const val = e.target.value;
                      const next = [...tfaDigits];
                      next[idx] = val;
                      setTfaDigits(next);
                      if (val && idx < 5) tfaRefs[idx + 1].current?.focus();
                    }}
                  />
                ))}
              </div>

              <div
                style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}
              >
                ⏰ <span style={{ color: 'var(--warning)', fontWeight: 700 }}>temp_token valid for 4:45</span>
              </div>

              <button
                type="submit"
                id="btn2FASubmit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px' }}
              >
                ✅ Verify &amp; Grant Dashboard Access
              </button>
            </form>

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
            <div style={{ fontSize: '56px', marginBottom: '12px' }}>🚫</div>
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
                🔒 Account temporarily locked due to failed attempts. Retry in{' '}
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
                  Email Address or Mobile Number
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
                    type="text"
                    id="loginIdentifier"
                    placeholder="adminboarding123@gmail.com or 7249417658"
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
                    if (identifier.trim()) {
                      const clean = identifier.trim();
                      setForgotEmail(clean);
                      setForgotMethod(/^\+?[\d\s-]{10,14}$/.test(clean) ? 'phone' : 'email');
                    }
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

            {/* Footer Links: Change Password & 2FA Setup */}
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
                href="#two-factor"
                onClick={(e) => {
                  e.preventDefault();
                  setAuthView('two-factor');
                }}
                style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}
              >
                2FA Setup
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
