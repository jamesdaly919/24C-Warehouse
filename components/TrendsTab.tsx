'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, ALL } from '@/components/CompanyApp';
import { Icon, Stat, Empty, Alert, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/api-client';
import type { TrendItem } from '@/lib/types';

type Period = 'day' | 'week' | 'month';
type View = 'usage' | 'reorder';
type SortKey = 'itemName' | 'out' | 'in' | 'daysLeft' | 'lead' | 'flag';

export default function TrendsTab() {
  const { company, locationId, locations } = useApp();
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('week');
  const [windowDays, setWindowDays] = useState(30);
  const [view, setView] = useState<View>('usage');
  const [search, setSearch] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('flag');
  const [asc, setAsc] = useState(true);
  const [updated, setUpdated] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await apiGet<{ trends: TrendItem[] }>(company.id, '/api/trends', { days: windowDays, location: locationId === ALL ? undefined : locationId });
      setTrends(d.trends || []);
      setUpdated(new Date().toLocaleTimeString('en-PH', { timeStyle: 'short' }));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [company.id, windowDays, locationId]);

  useEffect(() => { load(); }, [load]);

  const outRate = (t: TrendItem) => period === 'day' ? t.outPerDay : period === 'week' ? t.outPerWeek : t.outPerMonth;
  const inRate  = (t: TrendItem) => period === 'day' ? t.inPerDay  : period === 'week' ? t.inPerWeek  : t.inPerMonth;
  const per = period === 'day' ? '/day' : period === 'week' ? '/wk' : '/mo';

  const flagged = trends.filter((t) => t.isAnomalous).length;
  const soon = trends.filter((t) => t.estimatedDaysLeft !== null && t.estimatedDaysLeft <= 7).length;
  const reorder = trends.filter((t) => t.reorderPoint !== null && t.netStock <= (t.reorderPoint ?? 0)).length;

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return trends
      .filter((t) => !q || t.itemName.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      .filter((t) => !onlyFlagged || t.isAnomalous)
      .sort((a, b) => {
        let c = 0;
        if (sortKey === 'itemName') c = a.itemName.localeCompare(b.itemName);
        if (sortKey === 'out') c = outRate(a) - outRate(b);
        if (sortKey === 'in') c = inRate(a) - inRate(b);
        if (sortKey === 'daysLeft') c = (a.estimatedDaysLeft ?? 9999) - (b.estimatedDaysLeft ?? 9999);
        if (sortKey === 'lead') c = (a.avgLeadTimeDays ?? 9999) - (b.avgLeadTimeDays ?? 9999);
        if (sortKey === 'flag') c = (a.isAnomalous === b.isAnomalous ? (a.estimatedDaysLeft ?? 9999) - (b.estimatedDaysLeft ?? 9999) : a.isAnomalous ? -1 : 1);
        return asc ? c : -c;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trends, search, onlyFlagged, sortKey, asc, period]);

  const sort = (k: SortKey) => { if (sortKey === k) setAsc((a) => !a); else { setSortKey(k); setAsc(true); } };
  const Th = ({ k, children, className = '' }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`${k ? 'cursor-pointer select-none hover:text-ink' : ''} ${className}`} onClick={k ? () => sort(k) : undefined}>
      <span className="inline-flex items-center gap-1">{children}{k && sortKey === k && <span className="text-brand">{asc ? '↑' : '↓'}</span>}</span>
    </th>
  );
  const scopeLabel = locationId === ALL ? 'All locations' : (locations.find((l) => l.id === locationId)?.name ?? locationId);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Stat label="Items tracked" value={trends.length} />
        <Stat label="Flagged" value={flagged} tone={flagged ? 'critical' : 'ink'} active={onlyFlagged} onClick={() => setOnlyFlagged((v) => !v)} />
        <Stat label="Runs out ≤ 7 days" value={soon} tone={soon ? 'low' : 'ink'} />
        <Stat label="Below reorder point" value={reorder} tone={reorder ? 'brand' : 'ink'} />
      </div>

      <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
        <div className="seg">
          <button data-active={view === 'usage'} onClick={() => setView('usage')}>Usage frequency</button>
          <button data-active={view === 'reorder'} onClick={() => setView('reorder')}>Reorder & lead time</button>
        </div>
        <div className="relative flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input type="search" className="input pl-9" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="seg">
            {(['day', 'week', 'month'] as Period[]).map((p) => <button key={p} data-active={period === p} onClick={() => setPeriod(p)} className="capitalize">{p}</button>)}
          </div>
          <div className="seg">
            {[30, 90, 365].map((d) => <button key={d} data-active={windowDays === d} onClick={() => setWindowDays(d)}>{d}d</button>)}
          </div>
          <span className="badge-neutral"><Icon name="pin" size={12} />{scopeLabel}</span>
          <button onClick={load} className="btn-secondary btn-sm" title="Refresh"><Icon name="refresh" size={15} /></button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && trends.length === 0 ? (
        <div className="card py-16 text-center text-ink-3 text-sm flex items-center justify-center gap-2"><Spinner /> Computing trends…</div>
      ) : rows.length === 0 ? (
        <div className="card"><Empty icon="chart" title={trends.length === 0 ? 'No movements yet' : 'Nothing matches'}
              hint={trends.length === 0 ? 'Trends appear once items have been logged IN and OUT.' : undefined} /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              {view === 'usage' ? (
                <>
                  <thead><tr>
                    <Th k="itemName">Item</Th>
                    <Th k="out" className="text-right">Used {per}</Th>
                    <Th k="in" className="text-right hidden sm:table-cell">Received {per}</Th>
                    <Th className="hidden md:table-cell text-right">Total out / in</Th>
                    <Th className="hidden lg:table-cell">Last 30 days</Th>
                    <Th k="flag">Flag</Th>
                  </tr></thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.itemName} className={t.isAnomalous ? 'bg-critical-bg/40' : ''}>
                        <td><div className="font-semibold">{t.itemName}</div><div className="text-xs text-ink-3">{t.category} · {t.unit}</div></td>
                        <td className="text-right"><Rate v={outRate(t)} tone="out" /></td>
                        <td className="text-right hidden sm:table-cell"><Rate v={inRate(t)} tone="in" /></td>
                        <td className="hidden md:table-cell text-right tnum text-xs whitespace-nowrap">
                          <span className="text-move-out">{t.outTotal.toLocaleString()}</span><span className="text-ink-4 mx-1">/</span><span className="text-move-in">{t.inTotal.toLocaleString()}</span>
                        </td>
                        <td className="hidden lg:table-cell"><Sparkline data={t.sparkline} bad={t.isAnomalous} /></td>
                        <td><Flag t={t} /></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead><tr>
                    <Th k="itemName">Item</Th>
                    <Th className="text-right">On hand</Th>
                    <Th k="daysLeft" className="text-right">Days left</Th>
                    <Th className="hidden md:table-cell text-right">Reorder at</Th>
                    <Th k="lead" className="hidden md:table-cell text-right">Refill every</Th>
                    <Th className="hidden lg:table-cell text-right">Last refill</Th>
                    <Th k="flag">Flag</Th>
                  </tr></thead>
                  <tbody>
                    {rows.map((t) => {
                      const need = t.reorderPoint !== null && t.netStock <= t.reorderPoint;
                      return (
                        <tr key={t.itemName} className={t.isAnomalous ? 'bg-critical-bg/40' : need ? 'bg-low-bg/50' : ''}>
                          <td><div className="font-semibold flex items-center gap-1.5">{t.itemName}{need && <span className="text-brand"><Icon name="alert" size={14} /></span>}</div><div className="text-xs text-ink-3">{t.category}</div></td>
                          <td className="text-right tnum whitespace-nowrap"><span className="font-bold">{t.netStock.toLocaleString()}</span> <span className="text-xs text-ink-3">{t.unit}</span></td>
                          <td className="text-right"><DaysLeft d={t.estimatedDaysLeft} /></td>
                          <td className="hidden md:table-cell text-right tnum text-ink-2">{t.reorderPoint != null ? t.reorderPoint.toLocaleString() : '—'}</td>
                          <td className="hidden md:table-cell text-right tnum text-ink-2">{t.avgLeadTimeDays != null ? `${t.avgLeadTimeDays}d` : '—'}</td>
                          <td className="hidden lg:table-cell text-right tnum text-ink-2">{t.lastInDaysAgo != null ? `${t.lastInDaysAgo}d ago` : '—'}</td>
                          <td>{t.isAnomalous ? <Flag t={t} /> : need ? <span className="badge-low">Reorder</span> : <span className="text-ink-4">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </div>
      )}
      {updated && <p className="text-xs text-ink-4 text-right">Updated {updated} · {rows.length} items · last {windowDays} days</p>}
    </div>
  );
}

function Rate({ v, tone }: { v: number; tone: 'in' | 'out' }) {
  if (!v) return <span className="text-ink-4">—</span>;
  return <span className={`tnum font-semibold ${tone === 'out' ? 'text-move-out' : 'text-move-in'}`}>{v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()}</span>;
}
function DaysLeft({ d }: { d: number | null }) {
  if (d === null) return <span className="text-ink-4">—</span>;
  const cls = d <= 3 ? 'text-critical font-bold' : d <= 7 ? 'text-low font-semibold' : 'text-ink-2';
  return <span className={`tnum ${cls}`}>{d <= 0 ? 'Out' : `${d}d`}</span>;
}
function Flag({ t }: { t: TrendItem }) {
  if (!t.isAnomalous) return <span className="text-ink-4">—</span>;
  return <span className="badge-critical"><Icon name="alert" size={12} />{t.anomalyReason}</span>;
}
function Sparkline({ data, bad }: { data: number[]; bad: boolean }) {
  const w = 96, h = 26, max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(' ');
  const color = bad ? '#B91C1C' : 'var(--brand)';
  return (
    <svg width={w} height={h} className="block">
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
