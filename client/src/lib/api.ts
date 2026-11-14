import { useAuthStore } from '../stores/authStore';
import {
  cacheCollection,
  enqueueOfflineMutation,
  flushOfflineQueue,
  getCachedCollection,
} from './offlineDb';

export function getApiBase(): string {
  return ((import.meta as any).env?.VITE_API_URL || '/api').replace(/\/$/, '');
}

export class ApiError extends Error {
  status: number;
  data: any;
  code?: string;

  constructor(message: string, status: number, data: any = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data?.code || data?.errorCode;
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function attemptSilentRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const store = useAuthStore.getState();
    const refreshToken = store.refreshToken || localStorage.getItem('crm_refresh_token');
    const apiBase = getApiBase();

    try {
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
      if (!res.ok) return null;
      const json = await res.json().catch(() => ({}));
      const newAccess = json.accessToken || json.access_token || json.data?.accessToken;
      const newRefresh = json.refreshToken || json.refresh_token || json.data?.refreshToken;
      if (!newAccess) return null;
      store.setTokens(newAccess, newRefresh || refreshToken);
      return newAccess;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function buildHeaders(token: string | null, isFormData: boolean, extra?: Record<string, string>) {
  const headers: Record<string, string> = { ...(extra || {}) };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

const OFFLINE_AUTH_PREFIXES = ['/auth/', '/security/'];

export async function apiCall<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body: any = null,
  opts?: { skipOfflineQueue?: boolean; headers?: Record<string, string> }
): Promise<T> {
  const apiBase = getApiBase();
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isAuthRoute = OFFLINE_AUTH_PREFIXES.some((p) => endpoint.startsWith(p));

  const performFetch = async (tokenOverride?: string | null) => {
    const token =
      tokenOverride !== undefined
        ? tokenOverride
        : useAuthStore.getState().accessToken || localStorage.getItem('crm_token');
    const headers = buildHeaders(token, isFormData, opts?.headers);
    const options: RequestInit = {
      method,
      headers,
      credentials: 'include',
    };
    if (body !== null && body !== undefined && method !== 'GET') {
      options.body = isFormData ? body : JSON.stringify(body);
    }
    return fetch(`${apiBase}${endpoint}`, options);
  };

  // Offline handling before hitting network if browser already knows it's offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (method === 'GET') {
      const cached = await getCachedCollection<T>(endpoint);
      if (cached) return { ...(cached as any), _offlineCached: true };
    } else if (!isAuthRoute && !isFormData && !opts?.skipOfflineQueue) {
      await enqueueOfflineMutation(endpoint, method, body);
      return {
        queuedOffline: true,
        offlineQueued: true,
        message: 'Saved offline in Dexie queue. Will auto-sync when connection returns.',
      } as unknown as T;
    }
  }

  let res: Response;
  try {
    res = await performFetch();
  } catch (networkErr: any) {
    if (method === 'GET') {
      const cached = await getCachedCollection<T>(endpoint);
      if (cached) return { ...(cached as any), _offlineCached: true };
    } else if (!isAuthRoute && !isFormData && !opts?.skipOfflineQueue) {
      await enqueueOfflineMutation(endpoint, method, body);
      return {
        queuedOffline: true,
        offlineQueued: true,
        message: 'Saved offline in Dexie queue. Will auto-sync when connection returns.',
      } as unknown as T;
    }
    throw new ApiError(networkErr?.message || 'Network unavailable', 0, {});
  }

  // Silent single-flight refresh rotation on 401
  if (
    res.status === 401 &&
    !endpoint.includes('/auth/login') &&
    !endpoint.includes('/auth/refresh') &&
    !endpoint.includes('/auth/2fa') &&
    !endpoint.includes('/auth/verify-2fa')
  ) {
    const newToken = await attemptSilentRefresh();
    if (newToken) {
      res = await performFetch(newToken);
    } else {
      useAuthStore.getState().logout(true);
      throw new ApiError('Session expired. Please login again.', 401, { code: 'SESSION_EXPIRED' });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(msg || `API Error: ${res.statusText || res.status}`, res.status, data);
  }

  if (method === 'GET' && !isAuthRoute && data && typeof data === 'object') {
    cacheCollection(endpoint, data).catch(() => {});
  }

  return data as T;
}

export async function downloadApiFile(endpoint: string, fallbackFilename = 'export.xlsx'): Promise<void> {
  const apiBase = getApiBase();
  const doDownload = (token: string | null) =>
    fetch(`${apiBase}${endpoint}`, {
      method: 'GET',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let token = useAuthStore.getState().accessToken || localStorage.getItem('crm_token');
  let res = await doDownload(token);

  if (res.status === 401) {
    const newToken = await attemptSilentRefresh();
    if (!newToken) {
      useAuthStore.getState().logout(true);
      throw new ApiError('Session expired. Please login again.', 401);
    }
    res = await doDownload(newToken);
  }

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new ApiError(errJson?.message || `Download failed (${res.status})`, res.status, errJson);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : fallbackFilename;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function flushPendingOfflineMutations() {
  return flushOfflineQueue(async (url, method, body) => {
    return apiCall(url, method as any, body, { skipOfflineQueue: true });
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushPendingOfflineMutations().catch(() => {});
  });
}
