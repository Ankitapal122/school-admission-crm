import { useAuthStore } from '../stores/authStore';

export async function apiCall<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body: any = null
): Promise<T> {
  const token = useAuthStore.getState().accessToken || localStorage.getItem('crm_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const apiBase = ((import.meta as any).env?.VITE_API_URL || '/api').replace(/\/$/, '');
  const res = await fetch(`${apiBase}${endpoint}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new Error(msg || `API Error: ${res.statusText}`);
  }
  return data as T;
}
