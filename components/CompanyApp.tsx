'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import type { Company } from '@/lib/companies';
import type { Location } from '@/lib/types';
import { apiGet, readPref, writePref } from '@/lib/api-client';
import { Icon, type IconName } from '@/components/ui';
import LocationPicker from '@/components/LocationPicker';
import LogEntryForm from '@/components/LogEntryForm';
import CurrentStock from '@/components/CurrentStock';
import TrendsTab from '@/components/TrendsTab';
import OfflineBanner from '@/components/OfflineBanner';
import AdminPanel from '@/components/AdminPanel';

// ─── Context ──────────────────────────────────────────────────────────────────

export const ALL = 'ALL';

interface AppCtx {
  company: Company;
  locations: Location[];
  locationsLoading: boolean;
  /** Selected location id, or ALL (only meaningful for Stock / Trends) */
  locationId: string;
  setLocationId: (id: string) => void;
  /** The concrete location used for logging (never ALL) */
  activeLocation: Location | null;
  refreshLocations: () => Promise<void>;
  user: { name?: string; email?: string; isAdmin: boolean } | null;
  openAdmin: () => void;
}

const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside CompanyApp');
  return v;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

type TabId = 'log' | 'stock' | 'trends';
const TABS: Array<{ id: TabId; label: string; icon: IconName }> = [
  { id: 'log',    label: 'Log',    icon: 'pen' },
  { id: 'stock',  label: 'Stock',  icon: 'box' },
  { id: 'trends', label: 'Trends', icon: 'chart' },
];

export default function CompanyApp({ company }: { company: Company }) {
  const { data: session } = useSession();
  const [tab, setTab] = useState<TabId>('log');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationId, setLocationIdState] = useState<string>(ALL);
  const [adminOpen, setAdminOpen] = useState(false);
  const [alerts, setAlerts] = useState(0);

  const prefKey = `wh_${company.id}_location`;

  const refreshLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const d = await apiGet<{ locations: Location[] }>(company.id, '/api/locations');
      setLocations(d.locations || []);
    } catch { /* keep previous */ } finally { setLocationsLoading(false); }
  }, [company.id]);

  useEffect(() => {
    writePref('wh_last_company', company.id);
    setLocationIdState(readPref<string>(prefKey, ALL));
    refreshLocations();
  }, [company.id, prefKey, refreshLocations]);

  useEffect(() => {
    apiGet<{ trends: Array<{ isAnomalous: boolean }> }>(company.id, '/api/trends', { days: 30 })
      .then((d) => setAlerts((d.trends || []).filter((t) => t.isAnomalous).length))
      .catch(() => {});
  }, [company.id]);

  const setLocationId = useCallback((id: string) => { setLocationIdState(id); writePref(prefKey, id); }, [prefKey]);

  const activeLocation = useMemo(() => {
    if (!locations.length) return null;
    return locations.find((l) => l.id === locationId) ?? locations.find((l) => !l.parentId) ?? locations[0];
  }, [locations, locationId]);

  const user = session?.user
    ? { name: session.user.name ?? undefined, email: session.user.email ?? undefined, isAdmin: !!(session.user as any).isAdmin }
    : null;

  const ctx: AppCtx = {
    company, locations, locationsLoading, locationId, setLocationId, activeLocation,
    refreshLocations, user, openAdmin: () => setAdminOpen(true),
  };

  const brandVars = {
    ['--brand' as any]: company.brand,
    ['--brand-dark' as any]: company.brandDark,
    ['--brand-soft' as any]: company.brandSoft,
    ['--on-brand' as any]: company.onBrand,
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="min-h-dvh flex flex-col" style={brandVars}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-line">
          <div className="h-1 w-full bg-brand" />
          <div className="max-w-6xl mx-auto px-4">
            <div className="h-14 flex items-center gap-3">
              <Link href="/" className="btn-ghost btn-sm -ml-2 px-2" aria-label="All businesses" title="All businesses">
                <Icon name="grid" />
              </Link>
              <Image src={company.logo} alt={company.name} width={200} height={60} className="h-7 w-auto object-contain" priority />
              <div className="hidden sm:block leading-tight ml-1">
                <div className="font-bold text-sm">{company.name}</div>
                <div className="text-[11px] text-ink-3">{company.holding}</div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <LocationPicker />
                <button onClick={() => setAdminOpen(true)} className="btn-ghost btn-sm px-2" title="Admin" aria-label="Admin">
                  <Icon name="settings" />
                </button>
                {user ? (
                  <button onClick={() => signOut({ callbackUrl: `/${company.id}` })}
                          className="hidden sm:flex items-center gap-2 btn-ghost btn-sm" title="Sign out">
                    <span className="w-7 h-7 rounded-full bg-brand-soft text-brand flex items-center justify-center text-xs font-bold">
                      {(user.name || user.email || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm text-ink-2 max-w-[140px] truncate">{user.name || user.email}</span>
                    {user.isAdmin && <span className="badge-neutral">Admin</span>}
                  </button>
                ) : (
                  <a href={`/api/auth/signin?callbackUrl=/${company.id}`} className="hidden sm:inline-flex btn-secondary btn-sm">Sign in</a>
                )}
              </div>
            </div>

            {/* Desktop tabs */}
            <nav className="hidden sm:flex gap-1 -mb-px">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors
                          ${tab === t.id ? 'border-brand text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>
                  <Icon name={t.icon} size={16} />
                  {t.label === 'Log' ? 'Log entry' : t.label === 'Stock' ? 'Current stock' : 'Trends'}
                  {t.id === 'trends' && alerts > 0 && (
                    <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-critical text-white text-[11px] font-bold flex items-center justify-center">{alerts > 9 ? '9+' : alerts}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-5 pb-28 sm:pb-10">
          {tab === 'log' && (
            <section className="max-w-2xl mx-auto">
              <PageTitle title="Log entry" sub="Record stock moving in, out, or between locations." />
              <LogEntryForm onLogged={() => {}} />
            </section>
          )}
          {tab === 'stock' && (
            <section>
              <PageTitle title="Current stock" sub="Live quantities computed from every logged movement." />
              <CurrentStock />
            </section>
          )}
          {tab === 'trends' && (
            <section>
              <PageTitle title="Trends & reorder" sub="Usage frequency, refill lead times and early warnings." />
              <TrendsTab />
            </section>
          )}
        </main>

        {/* ── Mobile bottom nav ──────────────────────────────────────────── */}
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line pb-safe">
          <div className="grid grid-cols-3">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                      className={`relative flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-semibold transition-colors
                        ${tab === t.id ? 'text-brand' : 'text-ink-3'}`}>
                <Icon name={t.icon} size={22} strokeWidth={tab === t.id ? 2.4 : 2} />
                {t.label}
                {t.id === 'trends' && alerts > 0 && (
                  <span className="absolute top-2.5 right-[calc(50%-22px)] min-w-4 h-4 px-1 rounded-full bg-critical text-white text-[10px] font-bold flex items-center justify-center">{alerts > 9 ? '9+' : alerts}</span>
                )}
              </button>
            ))}
          </div>
        </nav>

        <OfflineBanner />
        {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
      </div>
    </Ctx.Provider>
  );
}

function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-ink-3 mt-0.5">{sub}</p>
    </div>
  );
}
