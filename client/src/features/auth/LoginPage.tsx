import React, { useState, useRef } from 'react';
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
  const [forgotEmail, setForgotEmail] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // 2FA State
  const [tempToken, setTempToken] = useState('');
  const [tfaDigits, setTfaDigits] = useState(['4', '8', '2', '9', '1', '5']);

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
      setIdentifier('admin@boardingedu.com');
      setPassword('Password@123');
      showToast('Admin account selected', 'success');
    } else if (role === 'manager') {
      setIdentifier('manager@boardingedu.com');
      setPassword('Password@123');
      showToast('Manager account selected', 'success');
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
      }
    } catch (err: any) {
      showToast(err.message || 'Invalid credentials.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await apiCall('/auth/forgot-password', 'POST', { email: forgotEmail.trim() });
      const code = res.demoOtp || '123456';
      setDemoOtp(code);
      setOtpDigits(code.split('').slice(0, 6));
      showToast(`Password reset OTP dispatched! (Demo OTP: ${code})`, 'success');
      setAuthView('verify-otp');
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const otp = otpDigits.join('');
    if (otp.length !== 6) {
      showToast('Please enter all 6 digits of the OTP code.', 'danger');
      return;
    }
    try {
      const res = await apiCall('/auth/verify-otp', 'POST', { email: forgotEmail, otp });
      setResetToken(res.resetToken);
      showToast('OTP verified! Create your new secure password.', 'success');
      setAuthView('create-new-password');
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  const handleCreateNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiCall('/auth/reset-password', 'POST', {
        resetToken,
        newPassword,
        confirmPassword,
      });
      showToast(res.message || 'Password updated successfully!', 'success');
      setAuthView('password-reset-success');
    } catch (err: any) {
      showToast(err.message, 'danger');
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

  const handleUseBackupCodeLogin = async () => {
    const code = window.prompt('Enter one of your 8-digit backup recovery codes (e.g. UK26-A1B2-C3D4):');
    if (!code) return;
    try {
      const res = await apiCall('/auth/verify-2fa', 'POST', {
        tempToken,
        code: code.trim(),
        isRecoveryCode: true,
      });
      if (res.user) {
        const token = res.token || res.accessToken;
        localStorage.setItem('crm_token', token);
        login(
          {
            id: res.user.id || res.user._id,
            email: res.user.email,
            fullName: res.user.name || res.user.fullName,
            role: 'SUPER_ADMIN',
            employeeId: res.user.employeeId,
          },
          token,
          res.refreshToken
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
            <div className="auth-header">
              <div
                className="auth-logo"
                style={{ background: 'linear-gradient(135deg, var(--warning), #FBBF24)' }}
              >
                🔑
              </div>
              <h1 className="auth-title">Forgot Password</h1>
              <p className="auth-subtitle">
                Enter your registered work email address to receive a secure single-use reset OTP.
              </p>
            </div>

            <form onSubmit={handleForgotPasswordSubmit}>
              <div className="form-group">
                <label className="form-label">
                  Registered Work Email <span className="req">*</span>
                </label>
                <input
                  type="email"
                  id="forgotEmail"
                  className="form-control"
                  placeholder="e.g. rahul@boardingedu.com"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>

              <button
                type="submit"
                id="btnForgot"
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px' }}
                disabled={isLoading}
              >
                {isLoading ? 'Dispatching secure OTP...' : '📨 Send Password Reset OTP'}
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
                  color: 'var(--text-muted)',
                  fontSize: '12px',
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
            <div className="auth-header">
              <div
                className="auth-logo"
                style={{ background: 'linear-gradient(135deg, var(--primary-blue), #3B82F6)' }}
              >
                🔢
              </div>
              <h1 className="auth-title">Verify Email OTP</h1>
              <p className="auth-subtitle">
                Enter the 6-digit verification code sent to{' '}
                <strong>{forgotEmail || 'your email'}</strong>
              </p>
            </div>

            {demoOtp && (
              <div
                style={{
                  background: 'var(--warning-bg)',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  marginBottom: '15px',
                  textAlign: 'center',
                }}
              >
                💡 <strong>Demo Mode OTP Code:</strong>{' '}
                <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 800 }}>
                  {demoOtp}
                </span>
              </div>
            )}

            <form onSubmit={handleVerifyOtpSubmit}>
              <div className="otp-inputs">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={otpRefs[idx]}
                    type="text"
                    maxLength={1}
                    className="otp-box"
                    value={digit}
                    onChange={(e) => {
                      const val = e.target.value;
                      const next = [...otpDigits];
                      next[idx] = val;
                      setOtpDigits(next);
                      if (val && idx < 5) otpRefs[idx + 1].current?.focus();
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
                <span style={{ color: 'var(--warning)', fontWeight: 700 }}>14:32</span> • Single-use
              </div>

              <button
                type="submit"
                id="btnVerifyOTP"
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px' }}
              >
                ✅ Verify OTP &amp; Proceed
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  setAuthView('forgot-password');
                }}
                style={{ color: 'var(--text-muted)', fontSize: '12px', textDecoration: 'none' }}
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
            <div className="auth-header">
              <div
                className="auth-logo"
                style={{ background: 'linear-gradient(135deg, var(--success), #34D399)' }}
              >
                🔐
              </div>
              <h1 className="auth-title">Create New Password</h1>
              <p className="auth-subtitle">
                Set a strong enterprise password compliant with security policy.
              </p>
            </div>

            <form onSubmit={handleCreateNewPasswordSubmit}>
              <div className="form-group">
                <label className="form-label">
                  New Password <span className="req">*</span>
                </label>
                <div className="input-with-action">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    id="resetNewPass"
                    className="form-control"
                    placeholder="Enter new strong password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="input-action-btn"
                    onClick={() => setShowNewPass(!showNewPass)}
                  >
                    👁️
                  </button>
                </div>
              </div>

              <div className="password-strength-bar">
                <div
                  id="strengthFill"
                  className="password-strength-fill"
                  style={{
                    width: `${strengthScore}%`,
                    background:
                      strengthScore === 100
                        ? 'var(--success)'
                        : strengthScore > 50
                        ? 'var(--warning)'
                        : 'var(--danger)',
                  }}
                />
              </div>

              <div className="password-requirements">
                <div className={`req-item ${has8 ? 'valid' : ''}`}>
                  <span>{has8 ? '✅' : '❌'}</span> Min 8 characters
                </div>
                <div className={`req-item ${hasUpperLower ? 'valid' : ''}`}>
                  <span>{hasUpperLower ? '✅' : '❌'}</span> At least 1 Uppercase &amp; 1 Lowercase
                  letter
                </div>
                <div className={`req-item ${hasNumSpec ? 'valid' : ''}`}>
                  <span>{hasNumSpec ? '✅' : '❌'}</span> At least 1 Number &amp; 1 Special char
                  (@$!%*?&amp;)
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '14px' }}>
                <label className="form-label">
                  Confirm New Password <span className="req">*</span>
                </label>
                <div className="input-with-action">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    id="resetConfirmPass"
                    className="form-control"
                    placeholder="Re-enter new password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="input-action-btn"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                  >
                    👁️
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
                ⚠️ <strong>Session Revocation:</strong> All existing active sessions and mobile
                tokens will be logged out upon password change.
              </div>

              <button
                type="submit"
                id="btnSetNewPass"
                className="btn btn-success"
                style={{ width: '100%', padding: '11px' }}
              >
                ✅ Save New Password in Database
              </button>
            </form>
          </div>
        </div>
      )}

      {authView === 'password-reset-success' && (
        <div className="auth-wrapper">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '54px', marginBottom: '12px' }}>🎉</div>
            <h1 className="auth-title" style={{ color: 'var(--success)' }}>
              Password Successfully Reset!
            </h1>
            <p className="auth-subtitle" style={{ marginTop: '8px' }}>
              Your new password has been securely hashed with bcrypt and saved to PostgreSQL. All
              active previous sessions have been revoked.
            </p>

            <button
              className="btn btn-primary"
              style={{ marginTop: '24px', padding: '12px 24px' }}
              onClick={() => setAuthView('login')}
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
              <a
                href="#recovery"
                onClick={(e) => {
                  e.preventDefault();
                  handleUseBackupCodeLogin();
                }}
                style={{ fontSize: '12px', color: 'var(--primary-blue)', fontWeight: 600 }}
              >
                Use 8-Character Recovery Code instead →
              </a>
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
            {/* Centered Graduation Cap Header matching Screenshot 1 */}
            <div style={{ textAlign: 'center', marginBottom: '26px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                  color: '#2563EB',
                }}
              >
                <svg
                  width="54"
                  height="54"
                  viewBox="0 0 24 24"
                  fill="#2563EB"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 3L1 9L12 15L21 10.09V17H23V9M5 13.18V17.18L12 21L19 17.18V13.18L12 17L5 13.18Z" />
                </svg>
              </div>
              <h1
                style={{
                  fontSize: '23px',
                  fontWeight: 800,
                  color: '#0F172A',
                  letterSpacing: '-0.4px',
                  marginBottom: '4px',
                }}
              >
                School Admission CRM
              </h1>
              <p style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 500 }}>
                Login to Your Account
              </p>
            </div>

            <form onSubmit={handleLoginSubmit}>
              <input type="hidden" id="loginRole" value={selectedRole} />

              {/* Email Address Field */}
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
                    type="text"
                    id="loginIdentifier"
                    placeholder="admin@boardingedu.com"
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
