import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'SENIOR_MANAGER' | 'COUNSELLOR';
  employeeId: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  previewRole: 'SUPER_ADMIN' | 'SENIOR_MANAGER' | 'COUNSELLOR' | null;
  setUser: (user: User) => void;
  setPreviewRole: (role: 'SUPER_ADMIN' | 'SENIOR_MANAGER' | 'COUNSELLOR' | null) => void;
  setTokens: (accessToken: string, refreshToken?: string) => void;
  login: (user: User, accessToken?: string, refreshToken?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false, // Starts locked out: Requires manual email & password entry
  previewRole: null,

  setUser: (user) => set({ user }),
  setPreviewRole: (previewRole) => set({ previewRole }),
  setTokens: (accessToken, refreshToken) =>
    set((state) => ({
      accessToken,
      refreshToken: refreshToken || state.refreshToken,
      isAuthenticated: true,
    })),
  login: (user, accessToken, refreshToken) => {
    set({
      user,
      accessToken: accessToken || null,
      refreshToken: refreshToken || null,
      isAuthenticated: true,
    });
  },
  logout: () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },
}));
