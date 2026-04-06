/**
 * lib/offline-queue.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side offline queue using localStorage.
 * When the device is offline, submissions are saved here.
 * On reconnect, they're automatically flushed to the API.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { OfflineQueueEntry, TransactionInput } from './types';

const QUEUE_KEY = 'wms_offline_queue';

function generateLocalId(): string {
  return `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function readQueue(): OfflineQueueEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function writeQueue(entries: OfflineQueueEntry[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable — silently fail; UI will show warning
  }
}

export function enqueue(payload: TransactionInput): OfflineQueueEntry {
  const entry: OfflineQueueEntry = {
    id:         generateLocalId(),
    payload,
    queuedAt:   new Date().toISOString(),
    retryCount: 0,
  };
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

export function dequeue(id: string): void {
  const queue = readQueue().filter((e) => e.id !== id);
  writeQueue(queue);
}

export function clearQueue(): void {
  try { localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
}

/**
 * Attempt to flush all queued entries to the API.
 * Returns { succeeded, failed } counts.
 */
export async function flushQueue(
  onProgress?: (entry: OfflineQueueEntry, success: boolean) => void
): Promise<{ succeeded: number; failed: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      const res = await fetch('/api/transactions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(entry.payload),
      });

      if (res.ok) {
        dequeue(entry.id);
        succeeded++;
        onProgress?.(entry, true);
      } else {
        // Increment retry count but keep in queue
        const q = readQueue();
        const idx = q.findIndex((e) => e.id === entry.id);
        if (idx !== -1) {
          q[idx].retryCount++;
          // Give up after 10 retries
          if (q[idx].retryCount >= 10) {
            q.splice(idx, 1);
            failed++;
          }
          writeQueue(q);
        }
        onProgress?.(entry, false);
      }
    } catch {
      failed++;
      onProgress?.(entry, false);
    }
  }

  return { succeeded, failed };
}
