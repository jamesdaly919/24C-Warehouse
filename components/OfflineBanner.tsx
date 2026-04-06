'use client';

import { useEffect, useState, useCallback } from 'react';
import { readQueue, flushQueue } from '@/lib/offline-queue';

type ConnectionState = 'online' | 'offline' | 'syncing';

export default function OfflineBanner() {
  const [connState,    setConnState]    = useState<ConnectionState>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSynced,   setLastSynced]   = useState<string | null>(null);
  const [syncResult,   setSyncResult]   = useState<string | null>(null);

  const refreshQueue = useCallback(() => {
    setPendingCount(readQueue().length);
  }, []);

  const sync = useCallback(async () => {
    const pending = readQueue();
    if (pending.length === 0) return;

    setConnState('syncing');
    const { succeeded, failed } = await flushQueue();
    refreshQueue();
    setLastSynced(new Date().toLocaleTimeString());
    setSyncResult(
      succeeded > 0
        ? `${succeeded} entr${succeeded === 1 ? 'y' : 'ies'} synced${failed > 0 ? `, ${failed} failed` : ''}`
        : `${failed} failed — will retry`
    );
    setConnState('online');

    // Clear result message after 4s
    setTimeout(() => setSyncResult(null), 4000);
  }, [refreshQueue]);

  useEffect(() => {
    refreshQueue();

    const handleOnline  = () => { setConnState('online');  sync(); };
    const handleOffline = () => { setConnState('offline'); refreshQueue(); };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll queue every 10s when online
    const interval = setInterval(() => {
      if (navigator.onLine) sync();
      else refreshQueue();
    }, 10_000);

    // Set initial state
    if (!navigator.onLine) setConnState('offline');

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [sync, refreshQueue]);

  // Don't render anything when fully online with no pending
  if (connState === 'online' && pendingCount === 0 && !syncResult) return null;

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 z-50
        flex items-center justify-between gap-3
        px-4 py-2.5 text-sm font-body
        border-t transition-all duration-300
        ${connState === 'offline'
          ? 'bg-status-critBg border-status-critical/30 text-status-critical'
          : connState === 'syncing'
          ? 'bg-status-lowBg  border-status-low/30     text-status-low'
          : 'bg-status-goodBg border-status-good/30    text-status-good'}
      `}
      role="status"
      aria-live="polite"
    >
      {/* Left: status */}
      <div className="flex items-center gap-2">
        {connState === 'offline' && (
          <>
            <span className="w-2 h-2 rounded-full bg-status-critical animate-pulse-dot" />
            <span className="font-semibold">No connection</span>
            {pendingCount > 0 && (
              <span className="text-ink-secondary">
                — {pendingCount} entr{pendingCount === 1 ? 'y' : 'ies'} saved locally, will sync when reconnected
              </span>
            )}
          </>
        )}
        {connState === 'syncing' && (
          <>
            <span className="w-2 h-2 rounded-full bg-status-low animate-spin
                             border-2 border-status-low border-t-transparent rounded-full" />
            <span className="font-semibold">Syncing {pendingCount} pending entr{pendingCount === 1 ? 'y' : 'ies'}…</span>
          </>
        )}
        {connState === 'online' && syncResult && (
          <>
            <span className="w-2 h-2 rounded-full bg-status-good" />
            <span className="font-semibold">Sync complete</span>
            <span className="text-ink-secondary">— {syncResult}</span>
          </>
        )}
        {connState === 'online' && !syncResult && pendingCount > 0 && (
          <>
            <span className="w-2 h-2 rounded-full bg-status-low animate-pulse-dot" />
            <span>
              {pendingCount} entr{pendingCount === 1 ? 'y' : 'ies'} pending sync
            </span>
          </>
        )}
      </div>

      {/* Right: manual sync + last synced */}
      <div className="flex items-center gap-3 shrink-0">
        {lastSynced && connState !== 'syncing' && (
          <span className="text-xs opacity-60 hidden sm:block">Last synced {lastSynced}</span>
        )}
        {pendingCount > 0 && connState === 'online' && (
          <button
            onClick={sync}
            className="text-xs underline underline-offset-2 hover:no-underline"
          >
            Sync now
          </button>
        )}
      </div>
    </div>
  );
}
