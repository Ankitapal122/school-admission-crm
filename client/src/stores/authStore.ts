import { create } from 'zustand';
import { CanonicalRole, BlueprintRole, normalizeRoleKey, toCanonicalRole } from '../lib/roles';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: CanonicalRole;
  blueprintRole?: BlueprintRole;
  rawRole?: string;
  employeeId: string;
  teamId?: string | null;
  twoFaEnabled?: boolean;
  is2faEnabled?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean; // Starts locked out: Requires manual email & password entry
  previewRole: CanonicalRole | null;
  rememberMe: boolean;
  lastActivityAt: number;
  setUser: (user: User) => void;
  setPreviewRole: (role: CanonicalRole | null) => void;
  setTokens: (accessToken: string, refreshToken?: string | null) => void;
  touchActivity: () => void;
  login: (user: any, accessToken?: string, refreshToken?: string, rememberMe?: boolean, serverExpiresAt?: string | number) => void;
  logout: (broadcast?: boolean) => void;
}

export function normalizeUserRecord(rawUser: any): User {
  const canonicalRole = toCanonicalRole(rawUser?.role || rawUser?.rawRole);
  const blueprintRole = normalizeRoleKey(rawUser?.role || rawUser?.rawRole);
  return {
    id: String(rawUser?.id || ''),
    email: String(rawUser?.email || ''),
    fullName: String(rawUser?.fullName || rawUser?.full_name || rawUser?.name || 'CRM User'),
    role: canonicalRole,
    blueprintRole,
    rawRole: rawUser?.role ? String(rawUser.role) : blueprintRole,
    employeeId: String(rawUser?.employeeId || rawUser?.employee_code || rawUser?.id || ''),
    teamId: rawUser?.teamId || rawUser?.team_id || null,
    twoFaEnabled: Boolean(rawUser?.twoFaEnabled ?? rawUser?.is2faEnabled),
    is2faEnabled: Boolean(rawUser?.is2faEnabled ?? rawUser?.twoFaEnabled),
  };
}

function loadInitialAuth(): {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  rememberMe: boolean;
} {
  if (typeof window === 'undefined') {
    return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false, rememberMe: false };
  }
  try {
    // Check if session duration has expired:
    // Admin: 30 days (1 Month)
    // Manager: 7 days (1 Week)
    // Counsellor: 7 days (1 Week)
    const sessionExpiresAtStr = localStorage.getItem('crm_session_expires_at');
    if (sessionExpiresAtStr && Date.now() >= Number(sessionExpiresAtStr)) {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_refresh_token');
      localStorage.removeItem('crm_user');
      localStorage.removeItem('crm_remember_me');
      localStorage.removeItem('crm_session_expires_at');
      localStorage.removeItem('crm_login_at');
      return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false, rememberMe: false };
    }

    const token = localStorage.getItem('crm_token');
    const refreshToken = localStorage.getItem('crm_refresh_token');
    const rawUser = localStorage.getItem('crm_user');
    const rememberMe = localStorage.getItem('crm_remember_me') === 'true';
    if (token && rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed && (parsed.id || parsed.email)) {
        return {
          user: normalizeUserRecord(parsed),
          accessToken: token,
          refreshToken: refreshToken || null,
          isAuthenticated: true,
          rememberMe,
        };
      }
    }
  } catch {
    // Corrupted storage falls back cleanly to logged out
  }
  return { user: null, accessToken: null, refreshToken: null, isAuthenticated: false, rememberMe: false };
}

const initialAuth = loadInitialAuth();

export const useAuthStore = create<AuthState>((set) => ({
  user: initialAuth.user,
  accessToken: initialAuth.accessToken,
  refreshToken: initialAuth.refreshToken,
  isAuthenticated: initialAuth.isAuthenticated,
  previewRole: null,
  rememberMe: initialAuth.rememberMe,
  lastActivityAt: Date.now(),

  setUser: (rawUser) => {
    const user = normalizeUserRecord(rawUser);
    try {
      localStorage.setItem('crm_user', JSON.stringify(user));
    } catch {
      // Ignore storage quota errors
    }
    set({ user });
  },

  setPreviewRole: (previewRole) => set({ previewRole }),

  setTokens: (accessToken, refreshToken) => {
    try {
      if (accessToken) localStorage.setItem('crm_token', accessToken);
      if (refreshToken) localStorage.setItem('crm_refresh_token', refreshToken);
      localStorage.setItem(
        'crm_token_sync',
        JSON.stringify({ accessToken, refreshToken: refreshToken || null, ts: Date.now() })
      );
    } catch {
      // Ignore storage quota errors
    }
    set((state) => ({
      accessToken,
      refreshToken: refreshToken || state.refreshToken,
      isAuthenticated: true,
      lastActivityAt: Date.now(),
    }));
  },

  touchActivity: () => set({ lastActivityAt: Date.now() }),

  login: (rawUser, accessToken, refreshToken, rememberMe = false, serverExpiresAt?: string | number) => {
    const user = normalizeUserRecord(rawUser);
    const roleKey = normalizeRoleKey(user.role);
    // Role-based session duration:
    // Admin: 30 days (1 Month)
    // Manager: 7 days (1 Week)
    // Counsellor: 7 days (1 Week)
    const durationDays = roleKey === 'super_admin' ? 30 : 7;
    const expiresAt = serverExpiresAt
      ? new Date(serverExpiresAt).getTime()
      : Date.now() + durationDays * 24 * 60 * 60 * 1000;

    try {
      if (accessToken) localStorage.setItem('crm_token', accessToken);
      if (refreshToken) localStorage.setItem('crm_refresh_token', refreshToken);
      localStorage.setItem('crm_user', JSON.stringify(user));
      localStorage.setItem('crm_remember_me', rememberMe ? 'true' : 'false');
      localStorage.setItem('crm_session_expires_at', String(expiresAt));
      localStorage.setItem('crm_login_at', String(Date.now()));
    } catch {
      // Ignore storage quota errors
    }
    set({
      user,
      accessToken: accessToken || null,
      refreshToken: refreshToken || null,
      isAuthenticated: true,
      rememberMe,
      lastActivityAt: Date.now(),
    });
  },

  logout: (broadcast = true) => {
    try {
      const currentToken = localStorage.getItem('crm_token');
      if (currentToken && broadcast) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify({}),
        }).catch(() => {});
      }
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_refresh_token');
      localStorage.removeItem('crm_user');
      localStorage.removeItem('crm_remember_me');
      localStorage.removeItem('crm_session_expires_at');
      localStorage.removeItem('crm_login_at');
      if (broadcast) {
        localStorage.setItem('crm_logout_event', String(Date.now()));
      }
    } catch {
      // Ignore storage quota errors
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      previewRole: null,
      rememberMe: false,
    });
  },
}));

// Cross-tab logout & token rotation synchronization
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'crm_logout_event' && e.newValue) {
      const state = useAuthStore.getState();
      if (state.isAuthenticated) {
        state.logout(false);
      }
    } else if (e.key === 'crm_token_sync' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.accessToken) {
          useAuthStore.setState((state) => ({
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken || state.refreshToken,
          }));
        }
      } catch {
        // Ignore malformed sync payload
      }
    }
  });
}
