import Dexie, { Table } from 'dexie';

export interface OfflineMutation {
  id?: number;
  url: string;
  method: string;
  body: any;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
  retries: number;
  lastError?: string;
}

export interface CachedCollection {
  key: string;
  data: any;
  updatedAt: number;
}

class BoardingEduOfflineDB extends Dexie {
  queuedMutations!: Table<OfflineMutation, number>;
  cachedCollections!: Table<CachedCollection, string>;

  constructor() {
    super('BoardingEduCRMOfflineDB');
    this.version(1).stores({
      queuedMutations: '++id, url, method, status, createdAt',
      cachedCollections: 'key, updatedAt',
    });
  }
}

export const offlineDb = new BoardingEduOfflineDB();

function notifyQueueChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm-offline-sync-updated'));
  }
}

export async function enqueueOfflineMutation(url: string, method: string, body?: any) {
  const id = await offlineDb.queuedMutations.add({
    url,
    method: method.toUpperCase(),
    body: body ?? null,
    createdAt: Date.now(),
    status: 'pending',
    retries: 0,
  });
  notifyQueueChange();
  return id;
}

export async function getPendingMutationCount(): Promise<number> {
  try {
    return await offlineDb.queuedMutations.where('status').equals('pending').count();
  } catch {
    return 0;
  }
}

export async function listPendingMutations(): Promise<OfflineMutation[]> {
  try {
    return await offlineDb.queuedMutations.orderBy('createdAt').toArray();
  } catch {
    return [];
  }
}

export async function clearFailedOrAllMutations(onlyFailed = false) {
  if (onlyFailed) {
    await offlineDb.queuedMutations.where('status').equals('failed').delete();
  } else {
    await offlineDb.queuedMutations.clear();
  }
  notifyQueueChange();
}

export async function cacheCollection(key: string, data: any) {
  try {
    await offlineDb.cachedCollections.put({ key, data, updatedAt: Date.now() });
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export async function getCachedCollection<T = any>(key: string): Promise<T | null> {
  try {
    const row = await offlineDb.cachedCollections.get(key);
    return row ? (row.data as T) : null;
  } catch {
    return null;
  }
}

let isFlushing = false;

export async function flushOfflineQueue(
  executeFn: (url: string, method: string, body: any) => Promise<any>,
): Promise<{ synced: number; failed: number; remaining: number }> {
  if (isFlushing || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    const remaining = await getPendingMutationCount();
    return { synced: 0, failed: 0, remaining };
  }
  isFlushing = true;
  let synced = 0;
  let failed = 0;

  try {
    const items = await offlineDb.queuedMutations
      .where('status')
      .equals('pending')
      .sortBy('createdAt');

    for (const item of items) {
      if (!item.id) continue;
      await offlineDb.queuedMutations.update(item.id, { status: 'syncing' });
      try {
        await executeFn(item.url, item.method, item.body);
        await offlineDb.queuedMutations.delete(item.id);
        synced += 1;
      } catch (err: any) {
        const msg = err?.message || 'Replay failed';
        const isClientValidation = err?.status && err.status >= 400 && err.status < 500 && err.status !== 429;
        await offlineDb.queuedMutations.update(item.id, {
          status: isClientValidation || item.retries >= 3 ? 'failed' : 'pending',
          retries: (item.retries || 0) + 1,
          lastError: msg,
        });
        failed += 1;
      }
    }
  } finally {
    isFlushing = false;
    notifyQueueChange();
  }

  const remaining = await getPendingMutationCount();
  return { synced, failed, remaining };
}
