/**
 * lib/offline-queue.ts
 * Client-side offline queue (localStorage). Entries carry their company, so a
 * single queue serves every business on this device.
 */

import type { OfflineQueueEntry, TransactionInput } from './types';
import { apiUrl } from './api-client';

const QUEUE_KEY = 'wh_offline_queue_v2';

function localId(): string {
  return `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function readQueue(): OfflineQueueEntry[] {
  try { const raw = localStorage.getItem(QUEUE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export function writeQueue(entries: OfflineQueueEntry[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(entries)); } catch { /* full or unavailable */ }
}
export function enqueue(payload: TransactionInput): OfflineQueueEntry {
  const entry: OfflineQueueEntry = { id: localId(), payload, queuedAt: new Date().toISOString(), retryCount: 0 };
  writeQueue([...readQueue(), entry]);
  return entry;
}
export function dequeue(id: string) {
  writeQueue(readQueue().filter((e) => e.id !== id));
}

/** Attempts to send every queued entry. Returns counts. */
export async function flushQueue(
  onProgress?: (entry: OfflineQueueEntry, success: boolean) => void,
): Promise<{ succeeded: number; failed: number }> {
  const queue = readQueue();
  let succeeded = 0, failed = 0;
  for (const entry of queue) {
    try {
      const res = await fetch(apiUrl(entry.payload.company, '/api/transactions'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry.payload),
      });
      if (res.ok) { dequeue(entry.id); succeeded++; onProgress?.(entry, true); continue; }
      // 4xx = the entry itself is bad; drop it after a few tries so the queue doesn't jam
      const q = readQueue(); const i = q.findIndex((e) => e.id === entry.id);
      if (i !== -1) {
        q[i].retryCount++;
        if (q[i].retryCount >= (res.status >= 400 && res.status < 500 ? 3 : 10)) { q.splice(i, 1); failed++; }
        writeQueue(q);
      }
      onProgress?.(entry, false);
    } catch {
      failed++; onProgress?.(entry, false);
    }
  }
  return { succeeded, failed };
}
