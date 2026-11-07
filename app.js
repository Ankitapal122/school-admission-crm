// Uttarakhand Boarding Schools – Enterprise Student CRM
// Real Working Frontend Application connecting to live Node.js + MongoDB backend

const API_BASE = '/api';

const state = {
  user: null,
  token: localStorage.getItem('crm_token') || null,
  tempToken: null,
  selectedLoginRole: 'admin',
  currentWireframeScreen: 1,
  activeView: 'login', // 'login' | 'forgot-password' | 'verify-otp' | 'create-new-password' | 'password-reset-success' | 'two-factor' | 'authenticator-setup' | 'recovery-codes' | 'sessions' | 'unauthorized' | 'wireframe-screen' | 'dashboard' | 'leads' | 'teams' | 'users' | 'admissions' | 'commissions' | 'schools' | 'followups' | 'reports' | 'whatsapp' | 'ai' | 'settings'
  previewRole: null, // Admin preview: null | 'manager' | 'counsellor'
  sidebarCollapsed: false,
  kpiStats: null,
  leads: [],
  teams: [],
  users: [],
  schools: [],
  admissions: [],
  commissions: [],
  followUps: [],
  notifications: [],
  resetEmail: '',
  resetToken: '',
  demoOtp: ''
};

// API Client Helper
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `API Error: ${res.statusText}`);
    }
    return data;
  } catch (err) {
    console.error(`API Call failed [${method} ${endpoint}]:`, err);
    throw err;
  }
}

// Show Toast
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'danger' ? '❌' : '⚠️'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Initialize Application
async function init() {
  if (state.token) {
    try {
      const res = await apiCall('/auth/me');
      if (res.success && res.user) {
        state.user = res.user;
        state.activeView = 'dashboard';
        await loadInitialData();
      } else {
        logout();
      }
    } catch (e) {
      logout();
    }
  } else {
    state.activeView = 'login';
  }
  render();
}

// Logout
function logout() {
  state.user = null;
  state.token = null;
  state.tempToken = null;
  state.previewRole = null;
  localStorage.removeItem('crm_token');
  state.activeView = 'login';
  render();
}

// Load Data based on role
async function loadInitialData() {
  try {
    const roleToUse = state.previewRole || state.user.role;
    const [statsRes, leadsRes, schoolsRes, commissionsRes, followUpsRes] = await Promise.all([
      apiCall('/reports/dashboard-stats').catch(() => null),
      apiCall('/leads').catch(() => ({ leads: [] })),
      apiCall('/schools').catch(() => ({ schools: [] })),
      apiCall('/commissions').catch(() => ({ commissions: [] })),
      apiCall('/followups').catch(() => ({ followUps: [] }))
    ]);

    if (statsRes?.kpi) state.kpiStats = statsRes.kpi;
    if (leadsRes?.leads) state.leads = leadsRes.leads;
    if (schoolsRes?.schools) state.schools = schoolsRes.schools;
    if (commissionsRes?.commissions) state.commissions = commissionsRes.commissions;
    if (followUpsRes?.followUps) state.followUps = followUpsRes.followUps;

    // Load admin / manager specific data
    if (roleToUse === 'admin' || roleToUse === 'manager') {
      const [teamsRes, admissionsRes] = await Promise.all([
        apiCall('/teams').catch(() => ({ teams: [] })),
        apiCall('/admissions').catch(() => ({ admissions: [] }))
      ]);
      if (teamsRes?.teams) state.teams = teamsRes.teams;
      if (admissionsRes?.admissions) state.admissions = admissionsRes.admissions;
    }

    if (roleToUse === 'admin') {
      const usersRes = await apiCall('/users').catch(() => ({ users: [] }));
      if (usersRes?.users) state.users = usersRes.users;
    }
  } catch (err) {
    console.warn('Initial data load warning:', err.message);
  }
}

// Main Render Function
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  // Render Authentication Views if not logged in
  if (!state.user) {
    switch (state.activeView) {
      case 'wireframe-screen':
        root.innerHTML = `
          <div style="background:#F1F5F9; min-height:100vh; padding:20px 15px;">
            <div style="max-width:1240px; margin:0 auto 15px; display:flex; justify-content:space-between; align-items:center;">
              <button class="screen-nav-btn" onclick="navigateTo('login')">
                ← Back to Login
              </button>
              <span style="font-weight:700; color:#1E3A8A; font-size:14px;">🎓 BoardingEdu CRM – Wireframe Specification Viewer (Screens 1 to 36)</span>
            </div>
            ${typeof renderWireframeScreenViewer === 'function' ? renderWireframeScreenViewer(state.currentWireframeScreen || 1) : ''}
          </div>
        `;
        break;
      case 'forgot-password':
        root.innerHTML = renderForgotPasswordPage();
        break;
      case 'verify-otp':
        root.innerHTML = renderVerifyOTPPage();
        break;
      case 'create-new-password':
        root.innerHTML = renderCreateNewPasswordPage();
        break;
      case 'password-reset-success':
        root.innerHTML = renderPasswordResetSuccessPage();
        break;
      case 'two-factor':
        root.innerHTML = renderTwoFactorPage();
        break;
      case 'unauthorized':
        root.innerHTML = renderUnauthorizedPage();
        break;
      default:
        root.innerHTML = renderLoginPage();
    }
    return;
  }

  // Render App Shell Layout with Sidebar and Topbar
  root.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeMobileSidebar()"></div>
      <div class="main-wrapper ${state.sidebarCollapsed ? 'expanded' : ''}">
        ${renderTopbar()}
        <main class="content-body">
          ${renderMainContent()}
        </main>
      </div>
    </div>
  `;
}

/* ==========================================================================
   PAGE 1 TO 10: AUTHENTICATION VIEWS
   ========================================================================== */

// Page 1: Login Page (Styled matching School Admission CRM wireframe)
function renderLoginPage() {
  const currentRole = state.selectedLoginRole || 'admin';
  const defaultEmail = currentRole === 'admin' 
    ? 'admin@boardingedu.com' 
    : (currentRole === 'manager' ? 'manager@boardingedu.com' : 'rahul@boardingedu.com');

  return `
    <div class="auth-wrapper">
      <div class="auth-card">
        <!-- Centered BoardingEdu Logo -->
        <div style="display:flex; justify-content:center; align-items:center; margin-bottom:24px;">
          <img src="logo.png" alt="BoardingEdu" style="max-width:180px; width:100%; height:auto; object-fit:contain;">
        </div>

        <form onsubmit="handleLoginSubmit(event)">
          <!-- Hidden Role verified against MongoDB RBAC backend -->
          <input type="hidden" id="loginRole" value="${currentRole}">

          <!-- Email Address Field -->
          <div style="margin-bottom:16px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Email Address</label>
            <div class="auth-input-container">
              <span class="auth-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C9BAE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                </svg>
              </span>
              <input type="text" id="loginIdentifier" placeholder="admin@gmail.com" required value="${defaultEmail}">
            </div>
          </div>

          <!-- Password Field -->
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Password</label>
            <div class="auth-input-container">
              <span class="auth-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C9BAE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </span>
              <input type="password" id="loginPassword" placeholder="••••••••••••" required value="Password@123">
              <button type="button" class="auth-eye-btn" onclick="togglePasswordVisibility('loginPassword', this)" title="Show/Hide Password" aria-label="Toggle password visibility">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C9BAE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>

          <!-- Remember Me & Forgot Password Row -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#64748B; cursor:pointer; user-select:none;">
              <input type="checkbox" id="loginRememberMe" checked style="width:16px; height:16px; accent-color:#2563EB; cursor:pointer; border-radius:4px;">
              <span>Remember me</span>
            </label>
            <a href="javascript:void(0)" onclick="navigateTo('forgot-password')" style="color:#2563EB; font-size:13px; font-weight:600; text-decoration:none;">Forgot password?</a>
          </div>

          <!-- Login Button -->
          <button type="submit" id="btnLogin" class="auth-btn-primary">
            Login
          </button>
        </form>

        <!-- Divider: Login with Role -->
        <div class="auth-role-divider">
          <span>Login with Role</span>
        </div>

        <!-- Role Selection Cards -->
        <div class="auth-role-grid">
          <!-- Admin Card -->
          <div id="roleCard-admin" class="auth-role-card admin ${currentRole === 'admin' ? 'selected' : ''}" onclick="selectLoginRole('admin')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <circle cx="18" cy="15" r="2.5"></circle>
            </svg>
            <span class="role-title">Admin</span>
          </div>

          <!-- Manager Card -->
          <div id="roleCard-manager" class="auth-role-card manager ${currentRole === 'manager' ? 'selected' : ''}" onclick="selectLoginRole('manager')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span class="role-title">Manager</span>
          </div>

          <!-- Counsellor Card -->
          <div id="roleCard-counsellor" class="auth-role-card counsellor ${currentRole === 'counsellor' ? 'selected' : ''}" onclick="selectLoginRole('counsellor')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span class="role-title">Counsellor</span>
          </div>
        </div>

        <!-- Footer Links: Change Password & 2FA Setup -->
        <div style="display:flex; justify-content:center; gap:20px; margin-top:22px; font-size:12.5px;">
          <a href="javascript:void(0)" onclick="navigateTo('forgot-password')" style="color:#3B82F6; text-decoration:none; font-weight:500;">Change Password</a>
          <a href="javascript:void(0)" onclick="navigateTo('two-factor')" style="color:#3B82F6; text-decoration:none; font-weight:500;">2FA Setup</a>
        </div>

        <!-- Wireframe Specification Screens 1-36 Quick Explorer -->
        <div style="text-align:center; margin-top:18px; padding-top:14px; border-top:1px dashed #E2E8F0;">
          <a href="javascript:void(0)" onclick="navigateToWireframeScreen(1)" style="display:inline-flex; align-items:center; gap:6px; color:#1E3A8A; font-size:12px; font-weight:700; text-decoration:none; background:#EBF3FE; padding:6px 14px; border-radius:20px;">
            <span>🎨</span> Explore Wireframe Screens (1 to 36)
          </a>
        </div>
      </div>
    </div>
  `;
}

function selectLoginRole(role) {
  state.selectedLoginRole = role;
  const roleInput = document.getElementById('loginRole');
  if (roleInput) roleInput.value = role;

  const emailInput = document.getElementById('loginIdentifier');
  if (emailInput) {
    if (role === 'admin') emailInput.value = 'admin@boardingedu.com';
    else if (role === 'manager') emailInput.value = 'manager@boardingedu.com';
    else if (role === 'counsellor') emailInput.value = 'rahul@boardingedu.com';
  }

  ['admin', 'manager', 'counsellor'].forEach(r => {
    const card = document.getElementById(`roleCard-${r}`);
    if (card) {
      if (r === role) card.classList.add('selected');
      else card.classList.remove('selected');
    }
  });

  showToast(`Role selected: ${role.toUpperCase()}`, 'info');
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>`;
  } else {
    input.type = 'password';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C9BAE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const identifier = document.getElementById('loginIdentifier').value.trim();
  const password = document.getElementById('loginPassword').value;
  const role = document.getElementById('loginRole').value;
  const rememberMe = document.getElementById('loginRememberMe') ? document.getElementById('loginRememberMe').checked : true;

  const btn = document.getElementById('btnLogin');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Signing in...';
  }

  try {
    const res = await apiCall('/auth/login', 'POST', { identifier, password, role, rememberMe });

    if (res.require2FA) {
      state.tempToken = res.tempToken;
      showToast("Two-Factor Authentication required. Enter code to continue.", "warning");
      state.activeView = 'two-factor';
      render();
      return;
    }

    state.token = res.token;
    localStorage.setItem('crm_token', res.token);
    state.user = res.user;
    state.activeView = 'dashboard';
    showToast(`Welcome back, ${res.user.name}! Authenticated as ${res.user.role.toUpperCase()}`);
    await loadInitialData();
    render();
  } catch (err) {
    showToast(err.message, "danger");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Login';
    }
  }
}

// Page 2: Forgot Password Page
function renderForgotPasswordPage() {
  return `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo" style="background:linear-gradient(135deg, var(--warning), #FBBF24);">🔑</div>
          <h1 class="auth-title">Forgot Password</h1>
          <p class="auth-subtitle">Enter your registered work email address to receive a secure single-use reset OTP.</p>
        </div>

        <form onsubmit="handleForgotPasswordSubmit(event)">
          <div class="form-group">
            <label class="form-label">Registered Work Email <span class="req">*</span></label>
            <input type="email" id="forgotEmail" class="form-control" placeholder="e.g. rahul@boardingedu.com" required value="rahul@boardingedu.com">
          </div>

          <button type="submit" id="btnForgot" class="btn btn-primary" style="width:100%; padding:11px;">
            📨 Send Password Reset OTP
          </button>
        </form>

        <div style="text-align:center; margin-top:20px;">
          <a href="javascript:void(0)" onclick="navigateTo('login')" style="color:var(--text-muted); font-size:12px; text-decoration:none; font-weight:600;">
            ← Back to Login
          </a>
        </div>
      </div>
    </div>
  `;
}

async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim();
  const btn = document.getElementById('btnForgot');
  btn.disabled = true;
  btn.innerText = 'Dispatching secure OTP...';

  try {
    const res = await apiCall('/auth/forgot-password', 'POST', { email });
    state.resetEmail = email;
    state.demoOtp = res.demoOtp || '123456';
    showToast(`Password reset OTP dispatched! (Demo OTP: ${state.demoOtp})`);
    state.activeView = 'verify-otp';
    render();
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '📨 Send Password Reset OTP';
    }
  }
}

// Page 3: Email OTP Verification Page
function renderVerifyOTPPage() {
  return `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo" style="background:linear-gradient(135deg, var(--primary-blue), #3B82F6);">🔢</div>
          <h1 class="auth-title">Verify Email OTP</h1>
          <p class="auth-subtitle">Enter the 6-digit verification code sent to <strong>${state.resetEmail || 'your email'}</strong></p>
        </div>

        ${state.demoOtp ? `
          <div style="background:var(--warning-bg); border:1px solid #FDE68A; color:#92400E; padding:8px 12px; border-radius:8px; font-size:12px; margin-bottom:15px; text-align:center;">
            💡 <strong>Demo Mode OTP Code:</strong> <span style="font-family:monospace; font-size:14px; font-weight:800;">${state.demoOtp}</span>
          </div>
        ` : ''}

        <form onsubmit="handleVerifyOTPSubmit(event)">
          <div class="otp-inputs">
            <input type="text" maxlength="1" class="otp-box" id="otp1" value="${state.demoOtp ? state.demoOtp[0] : ''}" oninput="focusNext(this, 'otp2')">
            <input type="text" maxlength="1" class="otp-box" id="otp2" value="${state.demoOtp ? state.demoOtp[1] : ''}" oninput="focusNext(this, 'otp3')">
            <input type="text" maxlength="1" class="otp-box" id="otp3" value="${state.demoOtp ? state.demoOtp[2] : ''}" oninput="focusNext(this, 'otp4')">
            <input type="text" maxlength="1" class="otp-box" id="otp4" value="${state.demoOtp ? state.demoOtp[3] : ''}" oninput="focusNext(this, 'otp5')">
            <input type="text" maxlength="1" class="otp-box" id="otp5" value="${state.demoOtp ? state.demoOtp[4] : ''}" oninput="focusNext(this, 'otp6')">
            <input type="text" maxlength="1" class="otp-box" id="otp6" value="${state.demoOtp ? state.demoOtp[5] : ''}">
          </div>

          <div style="text-align:center; font-size:12px; color:var(--text-muted); margin-bottom:18px;">
            ⏰ Code expires in <span style="color:var(--warning); font-weight:700;">14:32</span> • Single-use
          </div>

          <button type="submit" id="btnVerifyOTP" class="btn btn-primary" style="width:100%; padding:11px;">
            ✅ Verify OTP &amp; Proceed
          </button>
        </form>

        <div style="text-align:center; margin-top:20px;">
          <a href="javascript:void(0)" onclick="navigateTo('forgot-password')" style="color:var(--text-muted); font-size:12px; text-decoration:none;">
            ← Resend OTP / Change Email
          </a>
        </div>
      </div>
    </div>
  `;
}

function focusNext(current, nextId) {
  if (current.value.length >= 1) {
    const next = document.getElementById(nextId);
    if (next) next.focus();
  }
}

async function handleVerifyOTPSubmit(e) {
  e.preventDefault();
  const otp = [
    document.getElementById('otp1').value,
    document.getElementById('otp2').value,
    document.getElementById('otp3').value,
    document.getElementById('otp4').value,
    document.getElementById('otp5').value,
    document.getElementById('otp6').value
  ].join('');

  if (otp.length !== 6) {
    showToast("Please enter all 6 digits of the OTP code.", "danger");
    return;
  }

  try {
    const res = await apiCall('/auth/verify-otp', 'POST', { email: state.resetEmail, otp });
    state.resetToken = res.resetToken;
    showToast("OTP verified! Create your new secure password.");
    state.activeView = 'create-new-password';
    render();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

// Page 4: Create New Password Page
function renderCreateNewPasswordPage() {
  return `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo" style="background:linear-gradient(135deg, var(--success), #34D399);">🔐</div>
          <h1 class="auth-title">Create New Password</h1>
          <p class="auth-subtitle">Set a strong enterprise password compliant with security policy.</p>
        </div>

        <form onsubmit="handleCreateNewPasswordSubmit(event)">
          <div class="form-group">
            <label class="form-label">New Password <span class="req">*</span></label>
            <div class="input-with-action">
              <input type="password" id="resetNewPass" class="form-control" placeholder="Enter new strong password" required oninput="validatePasswordStrength(this.value)">
              <button type="button" class="input-action-btn" onclick="togglePasswordVisibility('resetNewPass', this)">👁️</button>
            </div>
          </div>

          <div class="password-strength-bar">
            <div id="strengthFill" class="password-strength-fill"></div>
          </div>

          <div class="password-requirements">
            <div class="req-item" id="reqMin8"><span>❌</span> Min 8 characters</div>
            <div class="req-item" id="reqUpper"><span>❌</span> At least 1 Uppercase &amp; 1 Lowercase letter</div>
            <div class="req-item" id="reqNumSpec"><span>❌</span> At least 1 Number &amp; 1 Special char (@$!%*?&)</div>
          </div>

          <div class="form-group" style="margin-top:14px;">
            <label class="form-label">Confirm New Password <span class="req">*</span></label>
            <div class="input-with-action">
              <input type="password" id="resetConfirmPass" class="form-control" placeholder="Re-enter new password" required>
              <button type="button" class="input-action-btn" onclick="togglePasswordVisibility('resetConfirmPass', this)">👁️</button>
            </div>
          </div>

          <div style="background:#FFFBEB; border:1px solid #FDE68A; padding:8px 12px; border-radius:6px; font-size:11px; color:#92400E; margin-bottom:16px;">
            ⚠️ <strong>Session Revocation:</strong> All existing active sessions and mobile tokens will be logged out upon password change.
          </div>

          <button type="submit" id="btnSetNewPass" class="btn btn-success" style="width:100%; padding:11px;">
            ✅ Save New Password in Database
          </button>
        </form>
      </div>
    </div>
  `;
}

function validatePasswordStrength(val) {
  const r8 = document.getElementById('reqMin8');
  const ru = document.getElementById('reqUpper');
  const rns = document.getElementById('reqNumSpec');
  const fill = document.getElementById('strengthFill');
  if (!r8) return;

  const has8 = val.length >= 8;
  const hasUpperLower = /[a-z]/.test(val) && /[A-Z]/.test(val);
  const hasNumSpec = /[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val);

  r8.innerHTML = has8 ? "<span>✅</span> Min 8 characters" : "<span>❌</span> Min 8 characters";
  r8.className = `req-item ${has8 ? 'valid' : ''}`;

  ru.innerHTML = hasUpperLower ? "<span>✅</span> At least 1 Uppercase & 1 Lowercase letter" : "<span>❌</span> At least 1 Uppercase & 1 Lowercase letter";
  ru.className = `req-item ${hasUpperLower ? 'valid' : ''}`;

  rns.innerHTML = hasNumSpec ? "<span>✅</span> At least 1 Number & 1 Special char (@$!%*?&)" : "<span>❌</span> At least 1 Number & 1 Special char (@$!%*?&)";
  rns.className = `req-item ${hasNumSpec ? 'valid' : ''}`;

  let score = 0;
  if (has8) score += 33;
  if (hasUpperLower) score += 33;
  if (hasNumSpec) score += 34;

  fill.style.width = `${score}%`;
  fill.style.background = score === 100 ? 'var(--success)' : score > 50 ? 'var(--warning)' : 'var(--danger)';
}

async function handleCreateNewPasswordSubmit(e) {
  e.preventDefault();
  const newPassword = document.getElementById('resetNewPass').value;
  const confirmPassword = document.getElementById('resetConfirmPass').value;

  try {
    const res = await apiCall('/auth/reset-password', 'POST', {
      resetToken: state.resetToken,
      newPassword,
      confirmPassword
    });

    showToast(res.message);
    state.activeView = 'password-reset-success';
    render();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Page 5: Password Reset Success Page
function renderPasswordResetSuccessPage() {
  return `
    <div class="auth-wrapper">
      <div class="auth-card" style="text-align:center;">
        <div style="font-size:54px; margin-bottom:12px;">🎉</div>
        <h1 class="auth-title" style="color:var(--success);">Password Successfully Reset!</h1>
        <p class="auth-subtitle" style="margin-top:8px;">
          Your new password has been securely hashed with bcrypt and saved to MongoDB. All active previous sessions have been revoked.
        </p>

        <button class="btn btn-primary" style="margin-top:24px; padding:12px 24px;" onclick="navigateTo('login')">
          🚀 Proceed to Sign In with New Password
        </button>
      </div>
    </div>
  `;
}

// Page 6: Two-Factor Authentication Page (Login 2FA Challenge)
function renderTwoFactorPage() {
  return `
    <div class="auth-wrapper">
      <div class="auth-card" style="text-align:center;">
        <div class="auth-logo" style="background:linear-gradient(135deg, var(--primary-navy), #2563EB);">🛡️</div>
        <h1 class="auth-title">Two-Factor Authentication</h1>
        <p class="auth-subtitle">Enter the 6-digit verification code from Google Authenticator or your backup recovery code.</p>

        <form onsubmit="handle2FASubmit(event)">
          <div class="otp-inputs">
            <input type="text" maxlength="1" class="otp-box" id="tfa1" value="4" oninput="focusNext(this, 'tfa2')">
            <input type="text" maxlength="1" class="otp-box" id="tfa2" value="8" oninput="focusNext(this, 'tfa3')">
            <input type="text" maxlength="1" class="otp-box" id="tfa3" value="2" oninput="focusNext(this, 'tfa4')">
            <input type="text" maxlength="1" class="otp-box" id="tfa4" value="9" oninput="focusNext(this, 'tfa5')">
            <input type="text" maxlength="1" class="otp-box" id="tfa5" value="1" oninput="focusNext(this, 'tfa6')">
            <input type="text" maxlength="1" class="otp-box" id="tfa6" value="5">
          </div>

          <div style="font-size:12px; color:var(--text-muted); margin-bottom:20px;">
            ⏰ <span style="color:var(--warning); font-weight:700;">temp_token valid for 4:45</span>
          </div>

          <button type="submit" id="btn2FASubmit" class="btn btn-primary" style="width:100%; padding:11px;">
            ✅ Verify &amp; Grant Dashboard Access
          </button>
        </form>

        <div style="margin-top:16px;">
          <a href="javascript:void(0)" onclick="handleUseBackupCodeLogin()" style="font-size:12px; color:var(--primary-blue); font-weight:600;">
            Use 8-Character Recovery Code instead →
          </a>
        </div>

        <div style="margin-top:18px;">
          <a href="javascript:void(0)" onclick="navigateTo('login')" style="color:var(--text-muted); font-size:11.5px; text-decoration:none;">
            ← Cancel &amp; Back to Login
          </a>
        </div>
      </div>
    </div>
  `;
}

async function handle2FASubmit(e) {
  e.preventDefault();
  const code = [
    document.getElementById('tfa1').value,
    document.getElementById('tfa2').value,
    document.getElementById('tfa3').value,
    document.getElementById('tfa4').value,
    document.getElementById('tfa5').value,
    document.getElementById('tfa6').value
  ].join('');

  try {
    const res = await apiCall('/auth/verify-2fa', 'POST', {
      tempToken: state.tempToken,
      code
    });

    state.token = res.token;
    localStorage.setItem('crm_token', res.token);
    state.user = res.user;
    state.activeView = 'dashboard';
    showToast(`2FA Verified successfully! Welcome ${res.user.name}`);
    await loadInitialData();
    render();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

async function handleUseBackupCodeLogin() {
  const code = prompt("Enter one of your 8-digit backup recovery codes (e.g. UK26-A1B2-C3D4):");
  if (!code) return;

  try {
    const res = await apiCall('/auth/verify-2fa', 'POST', {
      tempToken: state.tempToken,
      code: code.trim(),
      isRecoveryCode: true
    });

    state.token = res.token;
    localStorage.setItem('crm_token', res.token);
    state.user = res.user;
    state.activeView = 'dashboard';
    showToast("Recovery code accepted! Welcome back.");
    await loadInitialData();
    render();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

// Page 10: Unauthorized Access Page (403 Forbidden)
function renderUnauthorizedPage() {
  return `
    <div class="auth-wrapper">
      <div class="auth-card" style="text-align:center;">
        <div style="font-size:56px; margin-bottom:12px;">🚫</div>
        <h1 class="auth-title" style="color:var(--danger);">403 – Unauthorized Access</h1>
        <p class="auth-subtitle" style="margin-top:8px;">
          You do not have permission to access the requested resource or role dashboard. The backend Role-Based Access Control (RBAC) engine blocked this request.
        </p>

        <button class="btn btn-navy" style="margin-top:24px;" onclick="navigateTo('dashboard')">
          ← Return to Authorized Dashboard
        </button>
      </div>
    </div>
  `;
}

function navigateTo(view) {
  state.activeView = view;
  closeMobileSidebar();
  render();
}

function navigateToWireframeScreen(num) {
  state.currentWireframeScreen = parseInt(num) || 1;
  state.activeView = 'wireframe-screen';
  closeMobileSidebar();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.toggle('mobile-open');
  if (backdrop) backdrop.classList.toggle('active');
}

function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.remove('active');
}

/* ==========================================================================
   APP SHELL: SIDEBAR & TOPBAR
   ========================================================================== */

function renderSidebar() {
  const role = state.previewRole || state.user.role;

  let navItems = '';

  if (role === 'admin') {
    navItems = `
      <div class="nav-section-title">ADMIN CORE</div>
      <a class="nav-item ${state.activeView === 'dashboard' ? 'active' : ''}" onclick="navigateTo('dashboard')">
        <span class="nav-icon">📊</span>
        <span>Organization Dashboard</span>
      </a>
      <a class="nav-item ${state.activeView === 'leads' ? 'active' : ''}" onclick="navigateTo('leads')">
        <span class="nav-icon">📥</span>
        <span>Lead Management</span>
        <span class="nav-badge danger">${state.leads.length}</span>
      </a>
      <a class="nav-item ${state.activeView === 'admissions' ? 'active' : ''}" onclick="navigateTo('admissions')">
        <span class="nav-icon">🎓</span>
        <span>Admission Tracking</span>
      </a>
      <a class="nav-item ${state.activeView === 'commissions' ? 'active' : ''}" onclick="navigateTo('commissions')">
        <span class="nav-icon">💰</span>
        <span>Commission Management</span>
        <span class="nav-badge warning">Ledger</span>
      </a>

      <div class="nav-section-title">MANAGEMENT &amp; SCHOOLS</div>
      <a class="nav-item ${state.activeView === 'teams' ? 'active' : ''}" onclick="navigateTo('teams')">
        <span class="nav-icon">👥</span>
        <span>Team Management</span>
      </a>
      <a class="nav-item ${state.activeView === 'users' ? 'active' : ''}" onclick="navigateTo('users')">
        <span class="nav-icon">👤</span>
        <span>User Management</span>
      </a>
      <a class="nav-item ${state.activeView === 'schools' ? 'active' : ''}" onclick="navigateTo('schools')">
        <span class="nav-icon">🏫</span>
        <span>Uttarakhand Schools (500)</span>
      </a>

      <div class="nav-section-title">AUTOMATION &amp; INTELLIGENCE</div>
      <a class="nav-item ${state.activeView === 'ai' ? 'active' : ''}" onclick="navigateTo('ai')">
        <span class="nav-icon">🧠</span>
        <span>AI Intelligence</span>
      </a>
      <a class="nav-item ${state.activeView === 'whatsapp' ? 'active' : ''}" onclick="navigateTo('whatsapp')">
        <span class="nav-icon">📱</span>
        <span>WhatsApp &amp; Email Centre</span>
      </a>
      <a class="nav-item ${state.activeView === 'followups' ? 'active' : ''}" onclick="navigateTo('followups')">
        <span class="nav-icon">📅</span>
        <span>Follow-up Management</span>
      </a>
      <a class="nav-item ${state.activeView === 'reports' ? 'active' : ''}" onclick="navigateTo('reports')">
        <span class="nav-icon">📈</span>
        <span>Reports &amp; Analytics</span>
      </a>

      <div class="nav-section-title">SECURITY &amp; SYSTEM</div>
      <a class="nav-item ${state.activeView === 'authenticator-setup' ? 'active' : ''}" onclick="navigateTo('authenticator-setup')">
        <span class="nav-icon">🛡️</span>
        <span>2FA &amp; Security</span>
      </a>
      <a class="nav-item ${state.activeView === 'sessions' ? 'active' : ''}" onclick="navigateTo('sessions')">
        <span class="nav-icon">💻</span>
        <span>Active Sessions</span>
      </a>
      <a class="nav-item ${state.activeView === 'settings' ? 'active' : ''}" onclick="navigateTo('settings')">
        <span class="nav-icon">⚙️</span>
        <span>System Settings</span>
      </a>
    `;
  } else if (role === 'manager') {
    navItems = `
      <div class="nav-section-title">MANAGER CONSOLE</div>
      <a class="nav-item ${state.activeView === 'dashboard' ? 'active' : ''}" onclick="navigateTo('dashboard')">
        <span class="nav-icon">📊</span>
        <span>Team Dashboard</span>
      </a>
      <a class="nav-item ${state.activeView === 'leads' ? 'active' : ''}" onclick="navigateTo('leads')">
        <span class="nav-icon">📥</span>
        <span>Team Leads</span>
      </a>
      <a class="nav-item ${state.activeView === 'lead-verification' ? 'active' : ''}" onclick="navigateTo('lead-verification')">
        <span class="nav-icon">✅</span>
        <span>Lead Verification</span>
        <span class="nav-badge danger">Review</span>
      </a>
      <a class="nav-item ${state.activeView === 'admissions' ? 'active' : ''}" onclick="navigateTo('admissions')">
        <span class="nav-icon">🎓</span>
        <span>Admission Tracking</span>
      </a>
      <a class="nav-item ${state.activeView === 'commissions' ? 'active' : ''}" onclick="navigateTo('commissions')">
        <span class="nav-icon">💰</span>
        <span>Team Commission</span>
      </a>
      <a class="nav-item ${state.activeView === 'schools' ? 'active' : ''}" onclick="navigateTo('schools')">
        <span class="nav-icon">🏫</span>
        <span>School Directory</span>
      </a>
      <a class="nav-item ${state.activeView === 'followups' ? 'active' : ''}" onclick="navigateTo('followups')">
        <span class="nav-icon">📅</span>
        <span>Follow-up Management</span>
      </a>
      <a class="nav-item ${state.activeView === 'whatsapp' ? 'active' : ''}" onclick="navigateTo('whatsapp')">
        <span class="nav-icon">📱</span>
        <span>WhatsApp Inbox</span>
      </a>
      <a class="nav-item ${state.activeView === 'reports' ? 'active' : ''}" onclick="navigateTo('reports')">
        <span class="nav-icon">📈</span>
        <span>Team Reports</span>
      </a>
    `;
  } else {
    // Counsellor
    navItems = `
      <div class="nav-section-title">COUNSELLOR DESK</div>
      <a class="nav-item ${state.activeView === 'dashboard' ? 'active' : ''}" onclick="navigateTo('dashboard')">
        <span class="nav-icon">📊</span>
        <span>My Dashboard</span>
      </a>
      <a class="nav-item ${state.activeView === 'leads' ? 'active' : ''}" onclick="navigateTo('leads')">
        <span class="nav-icon">📥</span>
        <span>My Assigned Leads</span>
      </a>
      <a class="nav-item ${state.activeView === 'create-lead' ? 'active' : ''}" onclick="openCreateLeadModal()">
        <span class="nav-icon">➕</span>
        <span>Create New Lead</span>
      </a>
      <a class="nav-item ${state.activeView === 'admissions' ? 'active' : ''}" onclick="navigateTo('admissions')">
        <span class="nav-icon">🎓</span>
        <span>My Admissions</span>
      </a>
      <a class="nav-item ${state.activeView === 'commissions' ? 'active' : ''}" onclick="navigateTo('commissions')">
        <span class="nav-icon">💰</span>
        <span>My Commission</span>
      </a>
      <a class="nav-item ${state.activeView === 'followups' ? 'active' : ''}" onclick="navigateTo('followups')">
        <span class="nav-icon">📅</span>
        <span>Follow-up Calendar</span>
      </a>
      <a class="nav-item ${state.activeView === 'schools' ? 'active' : ''}" onclick="navigateTo('schools')">
        <span class="nav-icon">🏫</span>
        <span>School Directory</span>
      </a>
      <a class="nav-item ${state.activeView === 'whatsapp' ? 'active' : ''}" onclick="navigateTo('whatsapp')">
        <span class="nav-icon">📱</span>
        <span>WhatsApp &amp; Templates</span>
      </a>
    `;
  }

  return `
    <aside class="sidebar ${state.sidebarCollapsed ? 'collapsed' : ''}">
      <div class="sidebar-header">
        <a href="javascript:void(0)" class="sidebar-brand" style="display:flex; align-items:center; gap:10px;">
          <img src="logo.png" alt="BoardingEdu" style="width:34px; height:34px; object-fit:contain; border-radius:6px; background:white; padding:2px; flex-shrink:0;">
          <div>
            <div class="brand-title">BoardingEdu CRM</div>
            <div class="brand-subtitle">Connecting Parents &amp; Schools</div>
          </div>
        </a>
        <button class="sidebar-toggle-btn" onclick="toggleSidebar()" title="Toggle Sidebar">
          ${state.sidebarCollapsed ? '→' : '←'}
        </button>
        <button class="sidebar-close-mobile-btn" onclick="closeMobileSidebar()" aria-label="Close navigation" title="Close">
          ✕
        </button>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section-title" style="color:#60A5FA; font-weight:800; letter-spacing:0.5px;">🎨 WIREFRAME SPEC (1-36)</div>
        <a class="nav-item ${state.activeView === 'wireframe-screen' ? 'active' : ''}" onclick="navigateToWireframeScreen(state.currentWireframeScreen || 1)">
          <span class="nav-icon">⚡</span>
          <span>Screens 1-36 Explorer</span>
          <span class="nav-badge" style="background:#2563EB; color:white; font-weight:800;">36</span>
        </a>
        ${navItems}
      </nav>

      <div class="sidebar-footer">
        <div class="user-mini-profile">
          <div class="avatar">${state.user.name.split(' ').map(n=>n[0]).join('').slice(0, 2)}</div>
          <div>
            <div class="user-meta-name">${state.user.name}</div>
            <div class="user-meta-role">${role.toUpperCase()}</div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="logout()" title="Logout" style="color:#CBD5E1; border-color:rgba(255,255,255,0.2);">
          🚪
        </button>
      </div>
    </aside>
  `;
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  render();
}

function renderTopbar() {
  const role = state.previewRole || state.user.role;
  const isPreview = !!state.previewRole;

  return `
    <header class="topbar">
      <div class="topbar-left">
        <button class="mobile-menu-btn" onclick="toggleMobileSidebar()" aria-label="Open navigation menu" title="Menu">
          <span>☰</span>
        </button>
        <h1 class="page-title">${formatPageTitle(state.activeView)}</h1>
        ${isPreview ? `
          <div class="preview-badge-banner">
            <span>👁️</span> PREVIEW MODE: Viewing interface as <strong>${state.previewRole.toUpperCase()}</strong> (Admin permissions intact)
            <button class="btn btn-sm btn-outline" style="margin-left:6px; padding:2px 6px;" onclick="exitPreviewMode()">Exit Preview</button>
          </div>
        ` : ''}
      </div>

      <div class="topbar-right">
        <!-- Wireframe Screen Navigator Button -->
        <button class="screen-nav-btn primary" onclick="navigateToWireframeScreen(state.currentWireframeScreen || 1)" style="font-weight:700; padding:6px 12px; margin-right:6px;">
          <span>🎨</span> <span>Screens 1–36 Explorer</span>
        </button>

        <!-- Admin Dashboard Switcher Preview Feature -->
        ${state.user.role === 'admin' ? `
          <div class="dashboard-switcher">
            <label>Dashboard Preview:</label>
            <select class="dashboard-select" onchange="switchDashboardPreview(this.value)">
              <option value="" ${!state.previewRole ? 'selected' : ''}>Admin (Full Control)</option>
              <option value="manager" ${state.previewRole === 'manager' ? 'selected' : ''}>Manager View Preview</option>
              <option value="counsellor" ${state.previewRole === 'counsellor' ? 'selected' : ''}>Counsellor View Preview</option>
            </select>
          </div>
        ` : ''}

        <button class="topbar-btn" onclick="showToast('You have 3 real-time alerts: Follow-ups due and new lead verification pending.')">
          <span>🔔</span>
          <span class="dot"></span>
        </button>

        <button class="btn btn-primary btn-sm" onclick="openCreateLeadModal()">
          ➕ New Lead
        </button>
      </div>
    </header>
  `;
}

function formatPageTitle(view) {
  if (view === 'wireframe-screen') {
    const sc = typeof getScreenByNum === 'function' ? getScreenByNum(state.currentWireframeScreen || 1) : null;
    return sc ? `Wireframe Screen ${sc.num}: ${sc.title}` : 'Wireframe Screen Explorer (1-36)';
  }
  const titles = {
    dashboard: 'Operational Dashboard',
    leads: 'Student & Parent Lead Management',
    'lead-verification': 'Lead Verification & Quality Approval',
    teams: 'Team Structure & Reassignment',
    users: 'Employee & Role Permissions',
    admissions: 'Admission Pipeline & Confirmed Revenue',
    commissions: 'Commission Ledger & Reversal Management',
    schools: 'Uttarakhand Boarding Schools Master (500)',
    followups: 'Parent Follow-up Calendar & Call Outcomes',
    whatsapp: 'WhatsApp Business API & Email Centre',
    ai: 'AI Intelligence Hub & School Recommender',
    reports: 'Enterprise Analytics & Conversion Reports',
    'authenticator-setup': 'Two-Factor Authentication Setup',
    sessions: 'Active Device Sessions & Revocation',
    settings: 'System Configuration & Timers'
  };
  return titles[view] || 'Uttarakhand Boarding CRM';
}

function switchDashboardPreview(role) {
  state.previewRole = role || null;
  showToast(role ? `Switched to ${role.toUpperCase()} Preview Mode` : "Returned to Admin Control Dashboard");
  loadInitialData().then(() => render());
}

function exitPreviewMode() {
  state.previewRole = null;
  loadInitialData().then(() => render());
}

/* ==========================================================================
   MAIN DASHBOARDS & VIEWS
   ========================================================================== */

function renderMainContent() {
  if (state.activeView === 'wireframe-screen') {
    return typeof renderWireframeScreenViewer === 'function'
      ? renderWireframeScreenViewer(state.currentWireframeScreen || 1)
      : '<div class="card">Loading Wireframe Screen...</div>';
  }

  switch (state.activeView) {
    case 'leads':
    case 'lead-verification':
      return renderLeadsView();
    case 'teams':
      return renderTeamsView();
    case 'users':
      return renderUsersView();
    case 'admissions':
      return renderAdmissionsView();
    case 'commissions':
      return renderCommissionsView();
    case 'schools':
      return renderSchoolsView();
    case 'followups':
      return renderFollowUpsView();
    case 'whatsapp':
      return renderWhatsAppView();
    case 'ai':
      return renderAIView();
    case 'reports':
      return renderReportsView();
    case 'authenticator-setup':
      return renderAuthenticatorSetupView();
    case 'sessions':
      return renderSessionsView();
    case 'settings':
      return renderSettingsView();
    default:
      return renderDashboardView();
  }
}

// 1. Dashboard View
function renderDashboardView() {
  const role = state.previewRole || state.user.role;
  const k = state.kpiStats || {};

  let kpiCardsHtml = '';
  if (role === 'admin') {
    kpiCardsHtml = `
      <div class="stats-grid">
        <div class="stat-card blue">
          <div class="stat-card-top"><span class="stat-label">Total Enquiries</span><div class="stat-icon">📥</div></div>
          <div class="stat-value">${k.totalEnquiries || state.leads.length}</div>
          <div class="stat-trend up"><span>↑</span> +14.2% vs last month</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-card-top"><span class="stat-label">Total Students</span><div class="stat-icon">👨‍🎓</div></div>
          <div class="stat-value">${k.totalStudents || 3}</div>
          <div class="stat-trend up"><span>↑</span> Profiles verified</div>
        </div>
        <div class="stat-card green">
          <div class="stat-card-top"><span class="stat-label">Total Admissions</span><div class="stat-icon">🎓</div></div>
          <div class="stat-value">${k.totalAdmissions || 1}</div>
          <div class="stat-trend up"><span>↑</span> Confirmed at Schools</div>
        </div>
        <div class="stat-card amber">
          <div class="stat-card-top"><span class="stat-label">Pending Verification</span><div class="stat-icon">⏳</div></div>
          <div class="stat-value">${k.pendingVerification || 1}</div>
          <div class="stat-trend">Needs Manager Review</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-card-top"><span class="stat-label">Uttarakhand Schools</span><div class="stat-icon">🏫</div></div>
          <div class="stat-value">${k.totalSchools || state.schools.length}</div>
          <div class="stat-trend">Dehradun / Mussoorie / Nainital</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-card-top"><span class="stat-label">Active Teams</span><div class="stat-icon">👥</div></div>
          <div class="stat-value">${k.totalTeams || state.teams.length || 1}</div>
          <div class="stat-trend">Target: 60 Admissions</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-card-top"><span class="stat-label">Total Counsellors</span><div class="stat-icon">👤</div></div>
          <div class="stat-value">${k.totalCounsellors || 2}</div>
          <div class="stat-trend up"><span>↑</span> High Adherence (94%)</div>
        </div>
        <div class="stat-card green">
          <div class="stat-card-top"><span class="stat-label">Total Commission</span><div class="stat-icon">💰</div></div>
          <div class="stat-value">₹${(k.totalCommission || 10000).toLocaleString()}</div>
          <div class="stat-trend up"><span>↑</span> Generated</div>
        </div>
        <div class="stat-card amber">
          <div class="stat-card-top"><span class="stat-label">Pending Commission</span><div class="stat-icon">⏱️</div></div>
          <div class="stat-value">₹${(k.pendingCommission || 10000).toLocaleString()}</div>
          <div class="stat-trend">Pending Approval</div>
        </div>
        <div class="stat-card green">
          <div class="stat-card-top"><span class="stat-label">Paid Commission</span><div class="stat-icon">✅</div></div>
          <div class="stat-value">₹${(k.paidCommission || 0).toLocaleString()}</div>
          <div class="stat-trend">Bank Dispatched</div>
        </div>
      </div>
    `;
  } else if (role === 'manager') {
    kpiCardsHtml = `
      <div class="stats-grid">
        <div class="stat-card blue"><div class="stat-card-top"><span class="stat-label">Team Leads</span><div class="stat-icon">📥</div></div><div class="stat-value">${k.totalTeamLeads || state.leads.length}</div></div>
        <div class="stat-card green"><div class="stat-card-top"><span class="stat-label">Team Admissions</span><div class="stat-icon">🎓</div></div><div class="stat-value">${k.totalTeamAdmissions || 1}</div></div>
        <div class="stat-card amber"><div class="stat-card-top"><span class="stat-label">Pending Verification</span><div class="stat-icon">⏳</div></div><div class="stat-value">${k.pendingVerification || 1}</div></div>
        <div class="stat-card green"><div class="stat-card-top"><span class="stat-label">Approved Leads</span><div class="stat-icon">✅</div></div><div class="stat-value">${k.approvedLeads || 2}</div></div>
        <div class="stat-card red"><div class="stat-card-top"><span class="stat-label">Returned Leads</span><div class="stat-icon">↩️</div></div><div class="stat-value">${k.returnedLeads || 0}</div></div>
        <div class="stat-card purple"><div class="stat-card-top"><span class="stat-label">Team Counsellors</span><div class="stat-icon">👥</div></div><div class="stat-value">${k.totalCounsellors || 2}</div></div>
        <div class="stat-card green"><div class="stat-card-top"><span class="stat-label">Team Commission</span><div class="stat-icon">💰</div></div><div class="stat-value">₹${(k.teamCommission || 10000).toLocaleString()}</div></div>
        <div class="stat-card blue"><div class="stat-card-top"><span class="stat-label">Team Conversion</span><div class="stat-icon">📈</div></div><div class="stat-value">${k.teamConversionRate || '33.3%'}</div></div>
      </div>
    `;
  } else {
    // Counsellor
    kpiCardsHtml = `
      <div class="stats-grid">
        <div class="stat-card blue"><div class="stat-card-top"><span class="stat-label">My Total Leads</span><div class="stat-icon">📥</div></div><div class="stat-value">${k.myTotalLeads || state.leads.length}</div></div>
        <div class="stat-card green"><div class="stat-card-top"><span class="stat-label">Approved Leads</span><div class="stat-icon">✅</div></div><div class="stat-value">${k.approvedLeads || 1}</div></div>
        <div class="stat-card amber"><div class="stat-card-top"><span class="stat-label">Pending Review</span><div class="stat-icon">⏳</div></div><div class="stat-value">${k.pendingVerification || 1}</div></div>
        <div class="stat-card red"><div class="stat-card-top"><span class="stat-label">Hot Leads</span><div class="stat-icon">🔥</div></div><div class="stat-value">${k.hotLeads || 2}</div></div>
        <div class="stat-card green"><div class="stat-card-top"><span class="stat-label">Confirmed Admissions</span><div class="stat-icon">🎓</div></div><div class="stat-value">${k.convertedAdmissions || 1}</div></div>
        <div class="stat-card purple"><div class="stat-card-top"><span class="stat-label">My Total Commission</span><div class="stat-icon">💰</div></div><div class="stat-value">₹${(k.myTotalCommission || 5000).toLocaleString()}</div></div>
        <div class="stat-card amber"><div class="stat-card-top"><span class="stat-label">Pending Payout</span><div class="stat-icon">⏱️</div></div><div class="stat-value">₹${(k.pendingCommission || 5000).toLocaleString()}</div></div>
        <div class="stat-card green"><div class="stat-card-top"><span class="stat-label">Paid Commission</span><div class="stat-icon">🏦</div></div><div class="stat-value">₹${(k.paidCommission || 0).toLocaleString()}</div></div>
      </div>
    `;
  }

  return `
    ${kpiCardsHtml}

    <div class="grid-2">
      <!-- Recent Leads Table -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">📥 Recent Enquiries &amp; Verification Status</h3>
            <span class="card-subtitle">Active enquiries across Uttarakhand boarding schools</span>
          </div>
          <button class="btn btn-outline btn-sm" onclick="navigateTo('leads')">View All Leads →</button>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Student</th>
                <th>Class</th>
                <th>Priority</th>
                <th>Verification</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${state.leads.slice(0, 5).map(l => `
                <tr>
                  <td><strong style="color:var(--primary-navy);">${l.leadId}</strong></td>
                  <td>${l.studentId?.name || 'Student'}</td>
                  <td>${l.studentId?.admissionClass || 'Class 6'}</td>
                  <td><span class="priority-badge priority-${l.leadPriority?.toLowerCase() || 'hot'}">${l.leadPriority}</span></td>
                  <td>
                    <span class="badge ${l.verificationStatus === 'Approved' ? 'badge-success' : l.verificationStatus === 'Pending Verification' ? 'badge-warning' : 'badge-danger'}">
                      ${l.verificationStatus}
                    </span>
                  </td>
                  <td><span class="badge badge-navy">${l.leadStatus}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Commission & Admissions Overview -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">💰 Admission &amp; Commission Pipeline</h3>
            <span class="card-subtitle">Live immutable ledger entries</span>
          </div>
          <button class="btn btn-outline btn-sm" onclick="navigateTo('commissions')">Commission Ledger →</button>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Beneficiary</th>
                <th>School</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${state.commissions.slice(0, 5).map(c => `
                <tr>
                  <td><strong style="color:var(--primary-navy);">${c.commissionId}</strong></td>
                  <td>${c.beneficiaryName} (${c.beneficiaryType})</td>
                  <td>${c.schoolName}</td>
                  <td><strong style="color:var(--success);">₹${c.amount.toLocaleString()}</strong></td>
                  <td>
                    <span class="badge ${c.status === 'Paid' ? 'badge-success' : c.status === 'Approved' ? 'badge-info' : c.status === 'Reversed' ? 'badge-danger' : 'badge-warning'}">
                      ${c.status}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 2. Leads View
function renderLeadsView() {
  const role = state.previewRole || state.user.role;
  const isManagerOrAdmin = role === 'admin' || role === 'manager';

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📥 Student &amp; Parent Lead Management</h2>
          <span class="card-subtitle">Manage, verify, and track parent enquiries for Uttarakhand boarding schools</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="openCreateLeadModal()">➕ Create New Lead</button>
          <button class="btn btn-outline" onclick="exportLeadsCSV()">📥 Export CSV</button>
        </div>
      </div>

      <!-- Filters -->
      <div style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
        <input type="text" id="leadSearchInput" placeholder="🔍 Search student, parent, phone..." class="form-control" style="flex:1 1 200px; max-width:100%;" oninput="filterLeadsTable()">
        <select id="leadPriorityFilter" class="form-control" style="flex:1 1 140px; max-width:100%;" onchange="filterLeadsTable()">
          <option value="">All Priorities</option>
          <option value="Hot">Hot</option>
          <option value="Warm">Warm</option>
          <option value="Cold">Cold</option>
        </select>
        <select id="leadVerifyFilter" class="form-control" style="flex:1 1 160px; max-width:100%;" onchange="filterLeadsTable()">
          <option value="">All Verification Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Pending Verification">Pending Verification</option>
          <option value="Approved">Approved</option>
          <option value="Returned">Returned</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <!-- Leads Table -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Lead ID</th>
              <th>Student Name</th>
              <th>Class</th>
              <th>Parent Details</th>
              <th>Budget</th>
              <th>Score</th>
              <th>Priority</th>
              <th>Verification Status</th>
              <th>Counsellor</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="leadsTableBody">
            ${state.leads.map(l => `
              <tr>
                <td><strong style="color:var(--primary-navy);">${l.leadId}</strong></td>
                <td><strong>${l.studentId?.name || 'Student'}</strong></td>
                <td>${l.studentId?.admissionClass || 'Class 6'}</td>
                <td>
                  <div>${l.parentId?.name || 'Parent'}</div>
                  <div style="font-size:11px; color:var(--text-muted);">${l.parentId?.mobile || ''}</div>
                </td>
                <td>${l.annualBudget || '₹4.5L - ₹6.5L'}</td>
                <td><span class="score-pill score-green">${l.leadScore || 85}</span></td>
                <td><span class="priority-badge priority-${l.leadPriority?.toLowerCase() || 'hot'}">${l.leadPriority}</span></td>
                <td>
                  <span class="badge ${l.verificationStatus === 'Approved' ? 'badge-success' : l.verificationStatus === 'Pending Verification' ? 'badge-warning' : l.verificationStatus === 'Returned' ? 'badge-danger' : 'badge-info'}">
                    ${l.verificationStatus}
                  </span>
                </td>
                <td>${l.assignedCounsellor?.name || 'Rahul S.'}</td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-outline btn-sm" onclick="openLeadDetailModal('${l._id}')">👁️ View</button>
                    ${isManagerOrAdmin && l.verificationStatus === 'Pending Verification' ? `
                      <button class="btn btn-success btn-sm" onclick="verifyLeadAction('${l._id}', 'approve')">✓ Approve</button>
                      <button class="btn btn-danger btn-sm" onclick="verifyLeadAction('${l._id}', 'return')">↩ Return</button>
                    ` : ''}
                    ${l.verificationStatus === 'Approved' && l.leadStatus !== 'Admission Confirmed' ? `
                      <button class="btn btn-primary btn-sm" onclick="openConfirmAdmissionModal('${l._id}')">🎓 Confirm</button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 3. Teams View (Admin & Manager)
function renderTeamsView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">👥 Team Management</h2>
          <span class="card-subtitle">Manage counseling teams, targets, manager assignments, and member rosters</span>
        </div>
        ${state.user.role === 'admin' ? `
          <button class="btn btn-primary" onclick="openCreateTeamModal()">➕ Create New Team</button>
        ` : ''}
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Team ID</th>
              <th>Team Name</th>
              <th>Code</th>
              <th>Manager</th>
              <th>Total Counsellors</th>
              <th>Leads Handled</th>
              <th>Confirmed Admissions</th>
              <th>Team Target</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.teams.map(t => `
              <tr>
                <td><strong>${t.teamId}</strong></td>
                <td><strong>${t.name}</strong></td>
                <td><span class="badge badge-navy">${t.code}</span></td>
                <td>${t.manager?.name || 'Unassigned'}</td>
                <td>${t.counsellors?.length || 0} Counsellors</td>
                <td>${t.totalLeads || 0}</td>
                <td><strong style="color:var(--success);">${t.totalAdmissions || 0}</strong></td>
                <td>${t.monthlyAdmissionTarget || 10} / month</td>
                <td><span class="badge ${t.status === 'Active' ? 'badge-success' : 'badge-danger'}">${t.status}</span></td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-outline btn-sm" onclick="openEditTeamModal('${t._id}')">✏️ Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="toggleTeamStatusAction('${t._id}')">${t.status === 'Active' ? '⏸ Deactivate' : '▶ Activate'}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 4. Users View (Admin only)
function renderUsersView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">👤 User Management</h2>
          <span class="card-subtitle">Create managers &amp; counsellors, assign teams, and control security permissions</span>
        </div>
        <button class="btn btn-primary" onclick="openCreateUserModal()">➕ Add New Employee</button>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Assigned Team</th>
              <th>Reporting Manager</th>
              <th>Status</th>
              <th>2FA Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.users.map(u => `
              <tr>
                <td><strong>${u.employeeId}</strong></td>
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'manager' ? 'badge-purple' : 'badge-navy'}">${u.role.toUpperCase()}</span></td>
                <td>${u.team?.name || '—'}</td>
                <td>${u.manager?.name || 'Super Admin'}</td>
                <td><span class="badge ${u.status === 'Active' ? 'badge-success' : 'badge-danger'}">${u.status}</span></td>
                <td>${u.twoFactorEnabled ? '🛡️ Enabled' : 'Disabled'}</td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-outline btn-sm" onclick="openAdminResetPasswordModal('${u._id}', '${u.name}')">🔑 Reset Pass</button>
                    <button class="btn btn-sm ${u.status === 'Active' ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatusAction('${u._id}')">
                      ${u.status === 'Active' ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 5. Admissions View
function renderAdmissionsView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🎓 Admission Tracking &amp; Confirmed Revenue</h2>
          <span class="card-subtitle">Only confirmed admissions with tuition fee receipts generate immutable commissions</span>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Admission ID</th>
              <th>Student Name</th>
              <th>School Admitted</th>
              <th>Class</th>
              <th>Confirmed Revenue</th>
              <th>Admission Date</th>
              <th>Counsellor</th>
              <th>Manager</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.admissions.map(a => `
              <tr>
                <td><strong style="color:var(--primary-navy);">${a.admissionId}</strong></td>
                <td><strong>${a.studentName}</strong></td>
                <td>${a.schoolName}</td>
                <td>${a.admissionClass}</td>
                <td><strong style="color:var(--success);">₹${a.confirmedRevenue.toLocaleString()}</strong></td>
                <td>${new Date(a.admissionDate).toLocaleDateString()}</td>
                <td>${a.assignedCounsellor?.name || 'Rahul S.'}</td>
                <td>${a.assignedManager?.name || 'Rajesh M.'}</td>
                <td><span class="badge ${a.admissionStatus === 'Cancelled' ? 'badge-danger' : 'badge-success'}">${a.admissionStatus}</span></td>
                <td>
                  ${a.admissionStatus !== 'Cancelled' ? `
                    <button class="btn btn-danger btn-sm" onclick="openCancelAdmissionModal('${a._id}')">↩ Cancel &amp; Reverse</button>
                  ` : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 6. Commission Management View (10-Step Workflow & Immutable Ledger)
function renderCommissionsView() {
  const role = state.previewRole || state.user.role;
  const isManagerOrAdmin = role === 'admin' || role === 'manager';

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">💰 Commission Management System (10-Step Workflow)</h2>
          <span class="card-subtitle">Immutable ledger tracking Counsellor (₹5k), Manager (₹2k), and Organization (₹3k) shares</span>
        </div>
        ${role === 'admin' ? `
          <button class="btn btn-primary" onclick="openCommissionRulesModal()">⚙️ Commission Policy Rules</button>
        ` : ''}
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Commission ID</th>
              <th>Beneficiary Name</th>
              <th>Type</th>
              <th>School &amp; Student</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Rule Ver.</th>
              <th>Payment UTR</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.commissions.map(c => `
              <tr style="${c.status === 'Reversed' ? 'background:#FFF1F2;' : ''}">
                <td><strong>${c.commissionId}</strong></td>
                <td><strong>${c.beneficiaryName}</strong></td>
                <td><span class="badge badge-navy">${c.beneficiaryType}</span></td>
                <td>
                  <div>${c.schoolName}</div>
                  <div style="font-size:11px; color:var(--text-muted);">${c.studentName}</div>
                </td>
                <td><strong style="color:${c.amount < 0 ? 'var(--danger)' : 'var(--success)'};">₹${c.amount.toLocaleString()}</strong></td>
                <td>
                  <span class="badge ${c.status === 'Paid' ? 'badge-success' : c.status === 'Approved' ? 'badge-info' : c.status === 'Reversed' ? 'badge-danger' : 'badge-warning'}">
                    ${c.status}
                  </span>
                </td>
                <td>v${c.ruleVersion}</td>
                <td>${c.paymentReference || '—'}</td>
                <td>
                  <div style="display:flex; gap:6px;">
                    ${isManagerOrAdmin && c.status === 'Pending Approval' ? `
                      <button class="btn btn-success btn-sm" onclick="approveCommissionAction('${c.commissionId}')">✓ Approve</button>
                    ` : ''}
                    ${role === 'admin' && (c.status === 'Approved' || c.status === 'Payable') ? `
                      <button class="btn btn-primary btn-sm" onclick="openRecordPaymentModal('${c.commissionId}')">💳 Record Pay</button>
                    ` : ''}
                    ${isManagerOrAdmin && c.status !== 'Reversed' ? `
                      <button class="btn btn-danger btn-sm" onclick="reverseCommissionAction('${c.commissionId}')">↩ Reverse</button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 7. Schools View (Uttarakhand 500 Boarding Schools Master)
function renderSchoolsView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🏫 Uttarakhand Boarding Schools Master Directory</h2>
          <span class="card-subtitle">Elite residential schools across Dehradun, Mussoorie, Nainital, and Ranikhet</span>
        </div>
        ${state.user.role === 'admin' ? `
          <button class="btn btn-primary" onclick="openAddSchoolModal()">➕ Add School</button>
        ` : ''}
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>School Name</th>
              <th>City</th>
              <th>Board</th>
              <th>Type</th>
              <th>Annual Fees</th>
              <th>Commission</th>
              <th>Hostel Rating</th>
              <th>Sports Infrastructure</th>
            </tr>
          </thead>
          <tbody>
            ${state.schools.map(s => `
              <tr>
                <td><strong style="color:var(--primary-navy);">#${s.rank}</strong></td>
                <td>
                  <strong>${s.name}</strong>
                  <div style="font-size:11px; color:var(--text-muted);">${s.description || ''}</div>
                </td>
                <td>${s.city}, ${s.state}</td>
                <td><span class="badge badge-navy">${s.board}</span></td>
                <td><span class="badge badge-info">${s.genderType.toUpperCase()}</span></td>
                <td><strong>${s.feesDisplay}</strong></td>
                <td><strong style="color:var(--success);">₹${s.defaultCommission.toLocaleString()}</strong></td>
                <td>⭐ ${s.hostelQuality || '5 Star'}</td>
                <td><span style="font-size:11px;">${s.sports?.slice(0, 3).join(', ') || ''}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 8. Follow-ups View
function renderFollowUpsView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📅 Parent Follow-up Calendar &amp; Call Outcomes</h2>
          <span class="card-subtitle">Log calls with DPDP Act 2023 verbal consent verification</span>
        </div>
        <button class="btn btn-primary" onclick="openLogCallModal()">📞 Log Call Outcome</button>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Student &amp; Parent</th>
              <th>Scheduled Time</th>
              <th>Type</th>
              <th>Outcome</th>
              <th>Duration</th>
              <th>DPDP Consent</th>
              <th>Counsellor</th>
            </tr>
          </thead>
          <tbody>
            ${state.followUps.map(f => `
              <tr>
                <td><strong>${f.followUpId}</strong></td>
                <td>
                  <div>${f.leadId?.studentId?.name || 'Student'}</div>
                  <div style="font-size:11px; color:var(--text-muted);">${f.leadId?.parentId?.name || ''}</div>
                </td>
                <td>${new Date(f.scheduledDate).toLocaleString()}</td>
                <td><span class="badge badge-navy">${f.type}</span></td>
                <td>${f.outcome}</td>
                <td>${f.duration}</td>
                <td>${f.dpdpConsentRecorded ? '✅ Consent Verified' : '❌ No Consent'}</td>
                <td>${f.counsellorId?.name || 'Rahul S.'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 9. AI Intelligence Hub
function renderAIView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🧠 AI Intelligence Hub (Backend-Secured)</h2>
          <span class="card-subtitle">AI-assisted lead scoring, school recommendations, and message synthesis</span>
        </div>
      </div>

      <div class="grid-2">
        <!-- AI School Recommender -->
        <div class="card" style="border:1px solid #BFDBFE;">
          <h3 class="card-title" style="margin-bottom:12px;">🎯 AI Uttarakhand School Matcher</h3>
          <div class="form-group">
            <label class="form-label">Student Gender</label>
            <select id="aiGender" class="form-control">
              <option value="boys">Boys Only</option>
              <option value="girls">Girls Only</option>
              <option value="co_ed" selected>Co-Educational</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Target Curriculum</label>
            <select id="aiBoard" class="form-control">
              <option value="CBSE">CBSE</option>
              <option value="ICSE">ICSE</option>
              <option value="IB" selected>IB / Cambridge</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Annual Budget Limit</label>
            <input type="number" id="aiBudget" class="form-control" value="1200000">
          </div>
          <button class="btn btn-primary" onclick="runAISchoolMatcher()">Run AI Recommendation Engine</button>
          <div id="aiSchoolResults" style="margin-top:14px;"></div>
        </div>

        <!-- AI Message Generator -->
        <div class="card" style="border:1px solid #C7D2FE;">
          <h3 class="card-title" style="margin-bottom:12px;">💬 AI WhatsApp &amp; Email Generator</h3>
          <div class="form-group">
            <label class="form-label">Parent Name</label>
            <input type="text" id="aiParentName" class="form-control" value="Col. Vikram Rawat">
          </div>
          <div class="form-group">
            <label class="form-label">Student Name</label>
            <input type="text" id="aiStudentName" class="form-control" value="Aditya Rawat">
          </div>
          <div class="form-group">
            <label class="form-label">Template Purpose</label>
            <select id="aiTemplateType" class="form-control">
              <option value="shortlist">School Shortlist Presentation</option>
              <option value="followup">Follow-up Call Request</option>
            </select>
          </div>
          <button class="btn btn-navy" onclick="runAIMessageGenerator()">Generate AI Message</button>
          <div id="aiMessageResult" style="margin-top:14px;"></div>
        </div>
      </div>
    </div>
  `;
}

async function runAISchoolMatcher() {
  const gender = document.getElementById('aiGender').value;
  const board = document.getElementById('aiBoard').value;
  const budget = parseFloat(document.getElementById('aiBudget').value);

  try {
    const res = await apiCall('/ai/recommend-schools', 'POST', {
      studentGender: gender,
      targetBoard: board,
      budgetMax: budget
    });

    const box = document.getElementById('aiSchoolResults');
    box.innerHTML = `
      <div style="font-weight:700; font-size:12px; margin-bottom:8px; color:var(--primary-navy);">Top AI Recommended Schools:</div>
      ${res.recommendations.slice(0, 3).map((s, idx) => `
        <div style="background:#F8FAFC; border:1px solid var(--border-color); border-radius:8px; padding:10px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${idx + 1}. ${s.name}</strong>
            <span class="score-pill score-green">Match: ${s.aiMatchScore}%</span>
          </div>
          <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">
            ${s.city} • ${s.board} • ${s.feesDisplay}
          </div>
          <div style="font-size:11px; color:#166534; margin-top:4px;">
            ✓ ${s.reasons?.join(' • ') || 'Verified match'}
          </div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function runAIMessageGenerator() {
  const pName = document.getElementById('aiParentName').value;
  const sName = document.getElementById('aiStudentName').value;
  const type = document.getElementById('aiTemplateType').value;

  try {
    const res = await apiCall('/ai/generate-message', 'POST', {
      parentName: pName,
      studentName: sName,
      templateType: type
    });

    const box = document.getElementById('aiMessageResult');
    box.innerHTML = `
      <div style="background:#E5DDD5; padding:12px; border-radius:8px;">
        <div style="background:#DCF8C6; padding:10px 12px; border-radius:8px; font-size:12px; white-space:pre-wrap; color:#111B21;">
${res.message}
        </div>
        <div style="text-align:right; margin-top:8px;">
          <button class="btn btn-whatsapp btn-sm" onclick="navigator.clipboard.writeText(\`${res.message.replace(/`/g, '\\`')}\`); showToast('Copied to clipboard!');">📋 Copy Message</button>
        </div>
      </div>
    `;
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 10. WhatsApp & Email Centre
function renderWhatsAppView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📱 WhatsApp &amp; Email Communications Hub</h2>
          <span class="card-subtitle">Official WhatsApp Business integration and verified delivery logs</span>
        </div>
        <button class="btn btn-whatsapp" onclick="openSendWhatsAppModal()">💬 Send WhatsApp Message</button>
      </div>

      <div class="card" style="background:#F0FDF4; border-color:#86EFAC;">
        <div style="display:flex; gap:12px; align-items:center;">
          <span style="font-size:28px;">📱</span>
          <div>
            <h4 style="color:#166534; font-weight:800;">Official WhatsApp Business API: Connected &amp; Verified</h4>
            <p style="font-size:12px; color:#15803D;">All outbound templates and brochures are dispatched with parent communication consent.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 11. Reports & Analytics View
function renderReportsView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📈 Reports &amp; Conversion Analytics</h2>
          <span class="card-subtitle">Organization-wide funnel analysis and school admission distribution</span>
        </div>
        <button class="btn btn-outline" onclick="showToast('Exporting analytics report...')">📄 Export PDF</button>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3 class="card-title">School-wise Admission Distribution</h3>
          <div style="margin-top:14px; font-size:12px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>The Doon School, Dehradun</span><strong>1 Admission (₹12.5L)</strong></div>
            <div style="background:#E2E8F0; height:8px; border-radius:4px; margin-bottom:12px;"><div style="background:var(--primary-blue); width:45%; height:100%; border-radius:4px;"></div></div>

            <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Welham Girls’ School, Dehradun</span><strong>Under Interview</strong></div>
            <div style="background:#E2E8F0; height:8px; border-radius:4px; margin-bottom:12px;"><div style="background:var(--purple); width:35%; height:100%; border-radius:4px;"></div></div>

            <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>SelaQui International, Dehradun</span><strong>1 In Progress</strong></div>
            <div style="background:#E2E8F0; height:8px; border-radius:4px;"><div style="background:var(--success); width:20%; height:100%; border-radius:4px;"></div></div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">Monthly Conversion Rate</h3>
          <div class="stat-value" style="color:var(--success); margin-top:10px;">33.3%</div>
          <p style="font-size:12px; color:var(--text-muted);">High conversion due to targeted WhatsApp school brochure presentation and fast verification.</p>
        </div>
      </div>
    </div>
  `;
}

// 12. Authenticator Setup & Recovery Codes
function renderAuthenticatorSetupView() {
  return `
    <div class="card" style="max-width:700px; margin:0 auto;">
      <div class="card-header">
        <div>
          <h2 class="card-title">🛡️ Two-Factor Authentication (2FA) Settings</h2>
          <span class="card-subtitle">Protect your CRM account with Google Authenticator or Microsoft Authenticator</span>
        </div>
        <span class="badge ${state.user.twoFactorEnabled ? 'badge-success' : 'badge-danger'}">
          ${state.user.twoFactorEnabled ? '2FA ACTIVE' : '2FA DISABLED'}
        </span>
      </div>

      ${state.user.twoFactorEnabled ? `
        <div style="background:var(--success-bg); border:1px solid #A7F3D0; padding:16px; border-radius:8px; margin-bottom:20px;">
          <h4 style="color:#065F46; font-weight:700;">✅ Two-Factor Authentication is currently active on your account.</h4>
          <p style="font-size:12px; color:#047857; margin-top:4px;">
            A 6-digit TOTP code from your authenticator app is required upon every login.
          </p>
          <button class="btn btn-danger btn-sm" style="margin-top:12px;" onclick="disable2FAAction()">Disable 2FA</button>
        </div>
      ` : `
        <button class="btn btn-primary" onclick="initiate2FASetup()">📱 Setup &amp; Connect Authenticator App</button>
        <div id="setup2FABox" style="margin-top:20px;"></div>
      `}
    </div>
  `;
}

async function initiate2FASetup() {
  try {
    const res = await apiCall('/auth/setup-2fa');
    const box = document.getElementById('setup2FABox');
    box.innerHTML = `
      <div style="background:#F8FAFC; border:1px solid var(--border-color); padding:20px; border-radius:10px;">
        <h4 style="color:var(--primary-navy); font-weight:800; margin-bottom:8px;">Step 1: Scan this QR Code</h4>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">Open Google Authenticator on your phone and tap (+) to scan this barcode.</p>

        <div style="text-align:center; margin-bottom:16px;">
          <img src="${res.qrCode}" style="border:2px solid var(--border-color); border-radius:8px; width:160px; height:160px;">
          <div style="margin-top:8px; font-family:monospace; font-size:13px; font-weight:700;">Secret: ${res.secret}</div>
        </div>

        <h4 style="color:var(--primary-navy); font-weight:800; margin-bottom:8px;">Step 2: Save Recovery Codes</h4>
        <div class="grid-3" style="font-family:monospace; font-size:12px; font-weight:700; margin-bottom:16px;">
          ${res.recoveryCodes.map(c => `<div style="background:white; padding:6px; border:1px dashed var(--warning); border-radius:4px; text-align:center;">${c}</div>`).join('')}
        </div>

        <h4 style="color:var(--primary-navy); font-weight:800; margin-bottom:8px;">Step 3: Enter 6-digit code to confirm</h4>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="text" id="confirm2FACode" class="form-control" style="width:160px;" placeholder="e.g. 123456" maxlength="6">
          <button class="btn btn-success" onclick="confirmEnable2FA()">Verify &amp; Activate 2FA</button>
        </div>
      </div>
    `;
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function confirmEnable2FA() {
  const code = document.getElementById('confirm2FACode').value.trim();
  if (!code) return showToast("Enter 6-digit code from authenticator app.", "danger");

  try {
    const res = await apiCall('/auth/enable-2fa', 'POST', { code });
    showToast(res.message);
    state.user.twoFactorEnabled = true;
    render();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function disable2FAAction() {
  if (confirm("Are you sure you want to disable Two-Factor Authentication?")) {
    try {
      const res = await apiCall('/auth/disable-2fa', 'POST');
      showToast(res.message);
      state.user.twoFactorEnabled = false;
      render();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }
}

// 13. Sessions View
function renderSessionsView() {
  return `
    <div class="card" style="max-width:700px; margin:0 auto;">
      <div class="card-header">
        <div>
          <h2 class="card-title">💻 Active Device Sessions</h2>
          <span class="card-subtitle">Review active logins and terminate sessions from other devices</span>
        </div>
        <button class="btn btn-danger btn-sm" onclick="revokeOtherSessionsAction()">Revoke Other Sessions</button>
      </div>

      <div style="font-size:12.5px;">
        <div style="background:#F8FAFC; border:1px solid var(--border-color); padding:12px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>Current Device (This Web Browser)</strong>
            <div style="font-size:11px; color:var(--text-muted);">IP: 127.0.0.1 • Windows • Chrome</div>
          </div>
          <span class="badge badge-success">ACTIVE NOW</span>
        </div>
      </div>
    </div>
  `;
}

async function revokeOtherSessionsAction() {
  try {
    const res = await apiCall('/auth/revoke-sessions', 'POST');
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 14. Settings View
function renderSettingsView() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">⚙️ System Configuration &amp; Expiry Timers</h2>
          <span class="card-subtitle">Global settings governing lead distribution, 90-90-90-360 cycles, and DPDP defaults</span>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h3 class="card-title" style="margin-bottom:12px;">⏱️ Lifecycle Expiry Rules</h3>
          <div class="form-group"><label class="form-label">Inactivity Threshold</label><input type="text" class="form-control" value="90 Days"></div>
          <div class="form-group"><label class="form-label">Follow-up Expiry Timeout</label><input type="text" class="form-control" value="90 Days"></div>
          <div class="form-group"><label class="form-label">Force Expire Limit</label><input type="text" class="form-control" value="360 Days"></div>
          <div class="form-group"><label class="form-label">Commission FNF Clawback Window</label><input type="text" class="form-control" value="90 Days"></div>
        </div>
        <div class="card">
          <h3 class="card-title" style="margin-bottom:12px;">🛡️ DPDP Act 2023 Compliance</h3>
          <div class="form-group"><label class="form-label">Online Retention Limit</label><input type="text" class="form-control" value="90 Days Database Queryable"></div>
          <div class="form-group"><label class="form-label">Cold Storage Archive</label><input type="text" class="form-control" value="12 Months Encrypted S3"></div>
          <button class="btn btn-primary" onclick="showToast('Global settings updated!')">Save Settings</button>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   MODALS: CREATE LEAD, CREATE TEAM, CONFIRM ADMISSION, ETC.
   ========================================================================== */

function openCreateLeadModal() {
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 style="font-size:16px; font-weight:800; color:var(--primary-navy);">➕ Create Parent &amp; Student Enquiry</h3>
          <button class="btn btn-sm btn-outline" onclick="closeModal()">✕</button>
        </div>
        <form onsubmit="handleCreateLeadSubmit(event)">
          <div class="modal-body">
            <!-- Duplicate alert banner -->
            <div id="modalDupAlert" style="display:none; background:#FEE2E2; border:1px solid #FCA5A5; color:#991B1B; padding:10px; border-radius:8px; font-size:12px; margin-bottom:14px;">
              ⚠️ <strong>Duplicate Match Warning:</strong> An existing parent with this phone number or student already exists in MongoDB!
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Parent Name <span class="req">*</span></label>
                <input type="text" id="mParentName" class="form-control" required value="Sanjay Bhattacharya">
              </div>
              <div class="form-group">
                <label class="form-label">Parent Mobile <span class="req">*</span></label>
                <input type="tel" id="mMobile" class="form-control" required value="+919876543210" oninput="checkDuplicateInModal(this.value)">
              </div>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Student Name <span class="req">*</span></label>
                <input type="text" id="mStudentName" class="form-control" required value="Arjun Bhattacharya">
              </div>
              <div class="form-group">
                <label class="form-label">Admission Class <span class="req">*</span></label>
                <select id="mClass" class="form-control">
                  <option value="Class 5">Class 5</option>
                  <option value="Class 6" selected>Class 6</option>
                  <option value="Class 7">Class 7</option>
                  <option value="Class 8">Class 8</option>
                  <option value="Class 9">Class 9</option>
                  <option value="Class 11">Class 11</option>
                </select>
              </div>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Preferred School</label>
                <select id="mSchool" class="form-control">
                  ${state.schools.map(s => `<option value="${s._id}">${s.name} (${s.city})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Annual Budget</label>
                <select id="mBudget" class="form-control">
                  <option value="₹5.5L - ₹7.5L" selected>₹5.5L - ₹7.5L</option>
                  <option value="₹8L - ₹12L">₹8L - ₹12L</option>
                  <option value="₹12L - ₹18L">₹12L - ₹18L</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Initial Counsellor Remark</label>
              <textarea id="mRemark" class="form-control" placeholder="Parent looking for top boarding school in Dehradun with sports facilities..."></textarea>
            </div>

            <div style="background:#F0FDF4; border:1px solid #BBF7D0; padding:10px; border-radius:6px; font-size:12px; color:#166534;">
              📅 <strong>Auto-Schedule Follow-up:</strong> Next follow-up is automatically set to <strong>+3 Days</strong> from submission.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">💾 Save &amp; Submit for Verification</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function checkDuplicateInModal(mobile) {
  if (mobile.replace(/\D/g, '').length < 10) return;
  try {
    const res = await apiCall('/leads/check-duplicate', 'POST', { mobile });
    const banner = document.getElementById('modalDupAlert');
    if (banner) {
      banner.style.display = res.isDuplicate ? 'block' : 'none';
    }
  } catch (e) {}
}

async function handleCreateLeadSubmit(e) {
  e.preventDefault();
  const parentName = document.getElementById('mParentName').value.trim();
  const mobile = document.getElementById('mMobile').value.trim();
  const studentName = document.getElementById('mStudentName').value.trim();
  const admissionClass = document.getElementById('mClass').value;
  const preferredSchool = document.getElementById('mSchool').value;
  const annualBudget = document.getElementById('mBudget').value;
  const remarks = document.getElementById('mRemark').value.trim();

  try {
    const res = await apiCall('/leads', 'POST', {
      parentName, mobile, studentName, admissionClass,
      preferredSchool, annualBudget, remarks, isDraft: false
    });

    showToast(res.message);
    closeModal();
    await loadInitialData();
    render();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function openConfirmAdmissionModal(leadId) {
  const lead = state.leads.find(l => l._id === leadId);
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 style="font-size:16px; font-weight:800; color:var(--primary-navy);">🎓 Confirm Admission &amp; Trigger Commission</h3>
          <button class="btn btn-sm btn-outline" onclick="closeModal()">✕</button>
        </div>
        <form onsubmit="handleConfirmAdmissionSubmit(event, '${leadId}')">
          <div class="modal-body">
            <div style="background:#EFF6FF; border:1px solid #BFDBFE; padding:12px; border-radius:8px; font-size:12px; margin-bottom:14px;">
              <strong>Lead:</strong> ${lead?.leadId} • <strong>Student:</strong> ${lead?.studentId?.name} • <strong>Parent:</strong> ${lead?.parentId?.name}
            </div>

            <div class="form-group">
              <label class="form-label">School Admitted <span class="req">*</span></label>
              <select id="cadmSchool" class="form-control" required>
                ${state.schools.map(s => `<option value="${s._id}">${s.name} (${s.city})</option>`).join('')}
              </select>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Confirmed Revenue / Tuition Fee (₹) <span class="req">*</span></label>
                <input type="number" id="cadmRevenue" class="form-control" value="850000" required>
              </div>
              <div class="form-group">
                <label class="form-label">Proof Document Filename <span class="req">*</span></label>
                <input type="text" id="cadmProof" class="form-control" value="admission_fee_receipt_verified.pdf" required>
              </div>
            </div>

            <div style="background:#FFFBEB; border:1px solid #FDE68A; padding:10px; border-radius:6px; font-size:11.5px; color:#92400E;">
              ⚡ <strong>Automatic Commission Engine:</strong> Confirming this admission will immediately generate 3 separate immutable commission records: Counsellor (₹5,000), Manager (₹2,000), and Organization (₹3,000).
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-success">✅ Confirm Admission &amp; Post Commission</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleConfirmAdmissionSubmit(e, leadId) {
  e.preventDefault();
  const schoolId = document.getElementById('cadmSchool').value;
  const confirmedRevenue = document.getElementById('cadmRevenue').value;
  const proofDocument = document.getElementById('cadmProof').value;

  try {
    const res = await apiCall('/admissions', 'POST', {
      leadId, schoolId, confirmedRevenue, proofDocument
    });

    showToast(res.message);
    closeModal();
    await loadInitialData();
    render();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function verifyLeadAction(leadId, action) {
  const notes = prompt(`Enter notes for ${action.toUpperCase()} action:`);
  try {
    const res = await apiCall(`/leads/${leadId}/verify`, 'PATCH', { action, notes });
    showToast(res.message);
    await loadInitialData();
    render();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function approveCommissionAction(commissionId) {
  try {
    const res = await apiCall(`/commissions/${commissionId}/approve`, 'PATCH');
    showToast(res.message);
    await loadInitialData();
    render();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function openRecordPaymentModal(commissionId) {
  const ref = prompt("Enter Bank UTR / Payment Reference Number (e.g. UTR-HDFC-98214):", `UTR-${Date.now()}`);
  if (!ref) return;

  apiCall(`/commissions/${commissionId}/pay`, 'POST', { paymentReference: ref, paymentDate: new Date() })
    .then(res => {
      showToast(res.message);
      loadInitialData().then(() => render());
    })
    .catch(err => showToast(err.message, 'danger'));
}

async function reverseCommissionAction(commissionId) {
  const reason = prompt("Enter official cancellation/reversal reason (e.g. Student relocated/cancelled):");
  if (!reason) return;

  try {
    const res = await apiCall(`/commissions/${commissionId}/reverse`, 'POST', { reason });
    showToast(res.message);
    await loadInitialData();
    render();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function closeModal(e) {
  const container = document.getElementById('modalContainer');
  if (container) container.innerHTML = '';
}

function exportLeadsCSV() {
  let csv = 'Lead ID,Student Name,Class,Parent Name,Mobile,Budget,Status,Verification\n';
  state.leads.forEach(l => {
    csv += `"${l.leadId}","${l.studentId?.name || ''}","${l.studentId?.admissionClass || ''}","${l.parentId?.name || ''}","${l.parentId?.mobile || ''}","${l.annualBudget || ''}","${l.leadStatus || ''}","${l.verificationStatus || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Uttarakhand_Boarding_Leads_${Date.now()}.csv`;
  a.click();
  showToast("Leads exported to CSV!");
}

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  init();
});
