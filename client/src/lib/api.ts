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
const inFlightGets = new Map<string, Promise<any>>();

function parseRetryAfterMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get('Retry-After');
  if (retryAfter) {
    const sec = Number(retryAfter);
    if (!Number.isNaN(sec) && sec > 0) {
      return Math.min(8000, Math.max(1000, sec * 1000));
    }
  }
  return Math.min(8000, attempt * 2000 + Math.floor(Math.random() * 400));
}

export async function apiCall<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body: any = null,
  opts?: { skipOfflineQueue?: boolean; headers?: Record<string, string> }
): Promise<T> {
  if (method === 'GET' && !opts?.headers) {
    const existing = inFlightGets.get(endpoint);
    if (existing) return existing as Promise<T>;
  }

  const execPromise = (async (): Promise<T> => {
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

  let res!: Response;
  let lastNetworkErr: any = null;
  const maxAttempts = isAuthRoute ? 6 : method === 'GET' ? 5 : 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await performFetch();
      lastNetworkErr = null;
      // Transparent auto-retry on transient gateway errors (502/503/504) and 429 rate-limiting for ALL methods
      // (a 502/503/504 or 429 from Render proxy means upstream Node did not process the request)
      if (
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        res.status === 429
      ) {
        if (attempt < maxAttempts) {
          const delay =
            res.status === 429
              ? parseRetryAfterMs(res, attempt)
              : Math.min(6000, 1500 + attempt * 1000);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      break;
    } catch (networkErr: any) {
      lastNetworkErr = networkErr;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, Math.min(5000, 1200 + attempt * 800)));
        continue;
      }
    }
  }

  if (lastNetworkErr) {
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
    throw new ApiError(
      'Unable to reach CRM server. Please refresh the page and try again.',
      0,
      {}
    );
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
      const isBackground =
        endpoint.includes('/presence') ||
        endpoint.includes('/heartbeat') ||
        endpoint.includes('/notifications') ||
        endpoint.includes('/privacy/status');
      if (!isBackground) {
        useAuthStore.getState().logout(false);
      }
      throw new ApiError('Session expired. Please login again.', 401, { code: 'SESSION_EXPIRED' });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (method === 'GET' && !isAuthRoute && (res.status === 429 || res.status >= 500)) {
      const cached = await getCachedCollection<T>(endpoint);
      if (cached) return { ...(cached as any), _offlineCached: true };
    }
    const rawMsg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    const isGatewayErr = res.status === 502 || res.status === 503 || res.status === 504;
    const msg =
      rawMsg ||
      (isGatewayErr
        ? 'CRM server is waking up or restarting. Please wait a few seconds and try again.'
        : res.status === 429
        ? 'Too many requests. Please wait a moment and try again.'
        : `API Error: ${res.statusText || res.status}`);
    throw new ApiError(msg, res.status, data);
  }

  if (method === 'GET' && !isAuthRoute && data && typeof data === 'object') {
    cacheCollection(endpoint, data).catch(() => {});
  }

  return data as T;
  })();

  if (method === 'GET' && !opts?.headers) {
    inFlightGets.set(endpoint, execPromise);
    execPromise.finally(() => {
      if (inFlightGets.get(endpoint) === execPromise) {
        inFlightGets.delete(endpoint);
      }
    });
  }

  return execPromise;
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
  let res!: Response;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      res = await doDownload(token);
      lastErr = null;
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        if (attempt < 4) {
          await new Promise((r) => setTimeout(r, 1500 + attempt * 1000));
          continue;
        }
      }
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
    }
  }

  if (lastErr) {
    throw new ApiError('Unable to reach server for download. Please retry in a moment.', 0);
  }

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
    const isGw = res.status === 502 || res.status === 503 || res.status === 504;
    throw new ApiError(
      errJson?.message ||
        (isGw
          ? 'Server is waking up. Please wait 5 seconds and click download again.'
          : `Download failed (${res.status})`),
      res.status,
      errJson
    );
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
