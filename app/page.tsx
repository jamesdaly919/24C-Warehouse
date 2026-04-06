'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import LogEntryForm  from '@/components/LogEntryForm';
import CurrentStock  from '@/components/CurrentStock';
import TrendsTab     from '@/components/TrendsTab';
import OfflineBanner from '@/components/OfflineBanner';

type TabId = 'log' | 'stock' | 'trends';

export default function HomePage() {
  const [activeTab,     setActiveTab]     = useState<TabId>('log');
  const [anomalyCount,  setAnomalyCount]  = useState(0);
  const { data: session } = useSession();

  const userName  = session?.user?.name  ?? undefined;
  const userEmail = session?.user?.email ?? undefined;
  const isAdmin   = (session?.user as any)?.isAdmin ?? false;

  useEffect(() => {
    fetch('/api/trends?days=30')
      .then((r) => r.json())
      .then((d) => {
        const count = (d.trends || []).filter((t: any) => t.isAnomalous).length;
        setAnomalyCount(count);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-bg-border bg-bg-base/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-amber-500 flex items-center justify-center text-bg-base font-display font-black text-sm">W</div>
              <span className="font-display font-bold text-ink-primary tracking-tight">WMS</span>
              <span className="hidden sm:inline text-ink-muted text-sm">24C Warehouse</span>
            </div>
            <div className="flex items-center gap-2">
              {userName ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs text-amber-400 font-bold">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline text-ink-secondary">{userName}</span>
                  {isAdmin && <span className="text-xs text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 hidden sm:inline">★ Admin</span>}
                </div>
              ) : (
                <a href="/api/auth/signin" className="text-xs text-ink-secondary hover:text-amber-400 border border-bg-border rounded px-2.5 py-1.5 transition-colors">Sign in</a>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav className="border-b border-bg-border bg-bg-surface sticky top-14 z-30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex">
            {[
              { id: 'log',    icon: '✍',  label: 'Log Entry' },
              { id: 'stock',  icon: '📦', label: 'Current Stock' },
              { id: 'trends', icon: '📊', label: 'Trends' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-150 flex-1 justify-center sm:flex-none sm:justify-start ${activeTab === tab.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-ink-secondary hover:text-ink-primary'}`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === 'trends' && anomalyCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-status-critical text-white text-xs font-bold shrink-0">
                    {anomalyCount > 9 ? '9+' : anomalyCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {activeTab === 'log' && (
          <div>
            <div className="mb-6">
              <h1 className="font-display font-bold text-2xl">Log Entry</h1>
              <p className="text-ink-secondary text-sm mt-1">Record items moving IN to or OUT of the warehouse.</p>
            </div>
            <LogEntryForm userName={userName} userEmail={userEmail} isAdmin={isAdmin} />
          </div>
        )}
        {activeTab === 'stock' && (
          <div>
            <div className="mb-6">
              <h1 className="font-display font-bold text-2xl">Current Stock</h1>
              <p className="text-ink-secondary text-sm mt-1">
                Live view of all items currently in the warehouse.
                <span className="ml-2 text-amber-400">★ = Admin-added</span>
              </p>
            </div>
            <CurrentStock isAdmin={isAdmin} />
          </div>
        )}
        {activeTab === 'trends' && (
          <div>
            <div className="mb-6">
              <h1 className="font-display font-bold text-2xl">Trends & Patterns</h1>
              <p className="text-ink-secondary text-sm mt-1">
                Consumption frequency, reorder urgency, and anomaly detection.
                {anomalyCount > 0 && <span className="ml-2 text-status-critical font-semibold">⚠ {anomalyCount} item{anomalyCount !== 1 ? 's' : ''} flagged</span>}
              </p>
            </div>
            <TrendsTab />
          </div>
        )}
      </main>

      <OfflineBanner />
    </div>
  );
}