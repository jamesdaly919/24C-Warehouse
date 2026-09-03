'use client';

import { useCallback, useEffect, useState } from 'react';
import { readQueue, flushQueue } from '@/lib/offline-queue';
import { Icon, Spinner } from '@/components/ui';

type Conn = 'online' | 'offline' | 'syncing';

export default function OfflineBanner() {
  const [conn, setConn] = useState<Conn>('online');
  const [pending, setPending] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  const refresh = useCallback(() => setPending(readQueue().length), []);

  const sync = useCallback(async () => {
    if (readQueue().length === 0) return;
    setConn('syncing');
    const { succeeded, failed } = await flushQueue();
    refresh();
    setResult(succeeded ? `${succeeded} synced${failed ? `, ${failed} failed` : ''}` : `${failed} failed — will retry`);
    setConn('online');
    setTimeout(() => setResult(null), 4000);
  }, [refresh]);

  useEffect(() => {
    refresh();
    const on = () => { setConn('online'); sync(); };
    const off = () => { setConn('offline'); refresh(); };
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const iv = setInterval(() => { if (navigator.onLine) sync(); else refresh(); }, 10_000);
    if (!navigator.onLine) setConn('offline');
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(iv); };
  }, [sync, refresh]);

  if (conn === 'online' && pending === 0 && !result) return null;

  const tone = conn === 'offline' ? 'bg-critical text-white' : conn === 'syncing' ? 'bg-low text-white' : 'bg-good text-white';

  return (
    <div role="status" aria-live="polite"
         className={`fixed left-3 right-3 sm:left-auto sm:right-4 bottom-[76px] sm:bottom-4 z-50 rounded-lg shadow-lift px-4 py-2.5 text-sm flex items-center gap-3 animate-slide-up ${tone}`}>
      {conn === 'offline' && <><Icon name="cloud-off" size={16} /><span className="font-semibold">Offline</span>{pending > 0 && <span className="opacity-90">· {pending} saved on this device</span>}</>}
      {conn === 'syncing' && <><Spinner /><span className="font-semibold">Syncing {pending}…</span></>}
      {conn === 'online' && result && <><Icon name="check" size={16} /><span className="font-semibold">{result}</span></>}
      {conn === 'online' && !result && pending > 0 && <><Icon name="clock" size={16} /><span>{pending} pending</span><button onClick={sync} className="underline font-semibold ml-1">Sync now</button></>}
    </div>
  );
}
