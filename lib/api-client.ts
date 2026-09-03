/**
 * lib/api-client.ts — tiny fetch helper that scopes every call to a company.
 */

import type { CompanyId } from './companies';

export function apiUrl(company: CompanyId, path: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(path, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  url.searchParams.set('company', company);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  return url.pathname + url.search;
}

export async function apiGet<T>(company: CompanyId, path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const res = await fetch(apiUrl(company, path, params), { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function apiPost<T>(company: CompanyId, path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(apiUrl(company, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// ─── Per-device preferences (best-effort) ─────────────────────────────────────

export function readPref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function writePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
