'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { TrendItem } from '@/app/api/trends/route';

// ── Sparkline ──────────────────────────────────────────────────────────────────
function Sparkline({ data, anomalous }: { data: number[]; anomalous: boolean }) {
  const max = Math.max(...data, 1);
  const color = anomalous ? '#EF4444' : '#F59E0B';
  const w = 80;
  const h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

// ── Days left badge ────────────────────────────────────────────────────────────
function DaysLeft({ days }: { days: number | null }) {
  if (days === null) return <span className="text-ink-muted">—</span>;
  if (days <= 0)  return <span className="text-status-critical font-bold text-xs">OUT</span>;
  if (days <= 3)  return <span className="text-status-critical font-bold text-xs">{days}d ⚠</span>;
  if (days <= 7)  return <span className="text-status-low font-semibold text-xs">{days}d</span>;
  if (days <= 14) return <span className="text-ink-primary text-xs">{days}d</span>;
  return <span className="text-ink-muted text-xs">{days}d</span>;
}

// ── Rate display ───────────────────────────────────────────────────────────────
function Rate({ value, unit }: { value: number; unit: string }) {
  if (value === 0) return <span className="text-ink-muted">—</span>;
  return (
    <span className="font-mono text-xs">
      {value < 1 ? value.toFixed(2) : value.toFixed(1)}
      <span className="text-ink-muted ml-0.5">{unit}</span>
    </span>
  );
}

// ── Period toggle ──────────────────────────────────────────────────────────────
type Period = 'day' | 'week' | 'month';
type SortKey = 'itemName' | 'outRate' | 'inRate' | 'daysLeft' | 'leadTime' | 'anomaly';

const PAGE_SIZE = 50;

export default function TrendsTab() {
  const [trends,       setTrends]       = useState<TrendItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [period,       setPeriod]       = useState<Period>('week');
  const [windowDays,   setWindowDays]   = useState(30);
  const [search,       setSearch]       = useState('');
  const [sortKey,      setSortKey]      = useState<SortKey>('anomaly');
  const [sortAsc,      setSortAsc]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [showAnomalous, setShowAnomalous] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState('');
  const [subTab,       setSubTab]       = useState<'frequency' | 'reorder'>('frequency');

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/trends?days=${windowDays}`);
      if (!res.ok) throw new Error('Failed to load trends');
      const data = await res.json();
      setTrends(data.trends || []);
      setLastRefreshed(new Date().toLocaleTimeString('en-PH', { timeStyle: 'short' }));
      setPage(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => { fetchTrends(); }, [fetchTrends]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const anomalousCount = trends.filter((t) => t.isAnomalous).length;

  const filtered = useMemo(() => {
    let list = trends.filter((t) =>
      t.itemName.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
    );
    if (showAnomalous) list = list.filter((t) => t.isAnomalous);

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'itemName') cmp = a.itemName.localeCompare(b.itemName);
      if (sortKey === 'outRate')  cmp = (period === 'day' ? a.outPerDay : period === 'week' ? a.outPerWeek : a.outPerMonth)
                                      - (period === 'day' ? b.outPerDay : period === 'week' ? b.outPerWeek : b.outPerMonth);
      if (sortKey === 'inRate')   cmp = (period === 'day' ? a.inPerDay : period === 'week' ? a.inPerWeek : a.inPerMonth)
                                      - (period === 'day' ? b.inPerDay : period === 'week' ? b.inPerWeek : b.inPerMonth);
      if (sortKey === 'daysLeft') cmp = (a.estimatedDaysLeft ?? 9999) - (b.estimatedDaysLeft ?? 9999);
      if (sortKey === 'leadTime') cmp = (a.avgLeadTimeDays ?? 9999) - (b.avgLeadTimeDays ?? 9999);
      if (sortKey === 'anomaly')  cmp = (a.isAnomalous === b.isAnomalous ? 0 : a.isAnomalous ? -1 : 1);
      return sortAsc ? cmp : -cmp;
    });
  }, [trends, search, showAnomalous, sortKey, sortAsc, period]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); setPage(1); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-ink-muted ml-1 text-xs">↕</span>;
    return <span className="text-amber-400 ml-1 text-xs">{sortAsc ? '↑' : '↓'}</span>;
  }

  function getOutRate(t: TrendItem) {
    return period === 'day' ? t.outPerDay : period === 'week' ? t.outPerWeek : t.outPerMonth;
  }
  function getInRate(t: TrendItem) {
    return period === 'day' ? t.inPerDay : period === 'week' ? t.inPerWeek : t.inPerMonth;
  }
  const periodLabel = period === 'day' ? '/d' : period === 'week' ? '/wk' : '/mo';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-20 animate-fade-in">

      {/* ── Summary bar ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="wms-card p-3 text-center">
          <div className="text-2xl font-display font-bold text-ink-primary">{trends.length}</div>
          <div className="text-xs text-ink-muted">Total Items</div>
        </div>
        <div
          className={`wms-card p-3 text-center cursor-pointer transition-colors
            ${showAnomalous ? 'border-status-critical/50 bg-status-critBg/40' : ''}`}
          onClick={() => { setShowAnomalous((s) => !s); setPage(1); }}
        >
          <div className={`text-2xl font-display font-bold ${anomalousCount > 0 ? 'text-status-critical' : 'text-ink-muted'}`}>
            {anomalousCount}
          </div>
          <div className="text-xs text-ink-muted">
            {showAnomalous ? '▶ Showing alerts' : 'Alerts'} {anomalousCount > 0 ? '⚠' : ''}
          </div>
        </div>
        <div className="wms-card p-3 text-center">
          <div className="text-2xl font-display font-bold text-status-low">
            {trends.filter((t) => t.estimatedDaysLeft !== null && t.estimatedDaysLeft <= 7).length}
          </div>
          <div className="text-xs text-ink-muted">Stockout ≤7d</div>
        </div>
        <div className="wms-card p-3 text-center">
          <div className="text-2xl font-display font-bold text-amber-400">
            {trends.filter((t) => t.reorderPoint !== null && t.netStock <= (t.reorderPoint ?? 0)).length}
          </div>
          <div className="text-xs text-ink-muted">Need Reorder</div>
        </div>
      </div>

      {/* ── Sub-tabs ──────────────────────────────────────────────────────── */}
      <div className="flex border-b border-bg-border">
        {([
          { id: 'frequency', label: '📈 Frequency' },
          { id: 'reorder',   label: '🔄 Reorder & Lead Times' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${subTab === t.id
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-ink-secondary hover:text-ink-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          className="wms-input flex-1"
          placeholder="Search items…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />

        {/* Period toggle */}
        <div className="flex rounded border border-bg-border overflow-hidden text-xs shrink-0">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-2 transition-colors capitalize
                ${period === p
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-bg-elevated text-ink-secondary hover:bg-bg-hover'}`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Window toggle */}
        <div className="flex rounded border border-bg-border overflow-hidden text-xs shrink-0">
          {[30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`px-3 py-2 transition-colors
                ${windowDays === d
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-bg-elevated text-ink-secondary hover:bg-bg-hover'}`}
            >
              {d}d
            </button>
          ))}
        </div>

        <button onClick={fetchTrends} className="wms-btn-secondary text-xs px-3 shrink-0">
          ↺
        </button>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-ink-muted text-right">Last updated {lastRefreshed} · {filtered.length} items</p>
      )}

      {/* ── Loading / Error ────────────────────────────────────────────────── */}
      {loading && (
        <div className="py-16 text-center text-ink-secondary text-sm animate-pulse">
          Computing trends…
        </div>
      )}
      {error && (
        <div className="p-4 bg-status-critBg border border-status-critical/30 rounded text-status-critical text-sm">
          {error}
        </div>
      )}

      {/* ── FREQUENCY TABLE ────────────────────────────────────────────────── */}
      {!loading && !error && subTab === 'frequency' && (
        <div className="wms-card overflow-x-auto">
          <table className="wms-table w-full">
            <thead>
              <tr>
                <th onClick={() => toggleSort('itemName')} className="cursor-pointer">
                  Item <SortIcon k="itemName" />
                </th>
                <th className="hidden sm:table-cell">Category</th>
                <th onClick={() => toggleSort('outRate')} className="cursor-pointer text-right text-txn-out/80">
                  OUT{periodLabel} <SortIcon k="outRate" />
                </th>
                <th onClick={() => toggleSort('inRate')} className="cursor-pointer text-right text-txn-in/80">
                  IN{periodLabel} <SortIcon k="inRate" />
                </th>
                <th className="hidden md:table-cell text-right">Total OUT</th>
                <th className="hidden md:table-cell text-right">Total IN</th>
                <th className="hidden lg:table-cell">Last 30d trend</th>
                <th onClick={() => toggleSort('anomaly')} className="cursor-pointer text-center">
                  Flag <SortIcon k="anomaly" />
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-ink-muted py-12">
                    No items match your filter
                  </td>
                </tr>
              )}
              {paginated.map((item) => (
                <tr
                  key={item.itemName}
                  className={item.isAnomalous ? 'bg-status-critBg/30' : ''}
                >
                  <td>
                    <span className="font-medium text-ink-primary font-body">{item.itemName}</span>
                  </td>
                  <td className="hidden sm:table-cell text-ink-secondary">{item.category}</td>
                  <td className="text-right">
                    <Rate value={getOutRate(item)} unit={periodLabel} />
                  </td>
                  <td className="text-right">
                    <Rate value={getInRate(item)} unit={periodLabel} />
                  </td>
                  <td className="hidden md:table-cell text-right text-txn-out text-xs font-mono">
                    {item.outTotal.toLocaleString()}
                  </td>
                  <td className="hidden md:table-cell text-right text-txn-in text-xs font-mono">
                    {item.inTotal.toLocaleString()}
                  </td>
                  <td className="hidden lg:table-cell">
                    <Sparkline data={item.sparkline} anomalous={item.isAnomalous} />
                  </td>
                  <td className="text-center">
                    {item.isAnomalous ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                                   bg-status-critBg text-status-critical border border-status-critical/30
                                   whitespace-nowrap"
                        title={item.anomalyReason}
                      >
                        ⚠ {item.anomalyReason}
                      </span>
                    ) : (
                      <span className="text-ink-muted text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── REORDER TABLE ─────────────────────────────────────────────────── */}
      {!loading && !error && subTab === 'reorder' && (
        <div className="wms-card overflow-x-auto">
          <table className="wms-table w-full">
            <thead>
              <tr>
                <th onClick={() => toggleSort('itemName')} className="cursor-pointer">
                  Item <SortIcon k="itemName" />
                </th>
                <th className="hidden sm:table-cell text-right">Stock</th>
                <th onClick={() => toggleSort('daysLeft')} className="cursor-pointer text-right">
                  Days Left <SortIcon k="daysLeft" />
                </th>
                <th className="hidden md:table-cell text-right">Reorder At</th>
                <th onClick={() => toggleSort('leadTime')} className="cursor-pointer text-right hidden md:table-cell">
                  Lead Time <SortIcon k="leadTime" />
                </th>
                <th className="hidden lg:table-cell text-right">Last Restock</th>
                <th className="hidden lg:table-cell">Last 30d trend</th>
                <th onClick={() => toggleSort('anomaly')} className="cursor-pointer text-center">
                  Flag <SortIcon k="anomaly" />
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-ink-muted py-12">
                    No items match your filter
                  </td>
                </tr>
              )}
              {paginated.map((item) => {
                const needsReorder = item.reorderPoint !== null && item.netStock <= item.reorderPoint;
                return (
                  <tr
                    key={item.itemName}
                    className={`
                      ${item.isAnomalous ? 'bg-status-critBg/30' : ''}
                      ${needsReorder && !item.isAnomalous ? 'bg-status-lowBg/20' : ''}
                    `}
                  >
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-ink-primary font-body">{item.itemName}</span>
                        {needsReorder && (
                          <span className="text-amber-400 text-xs font-bold reorder-pulse" title="Needs reorder">!</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell text-right font-mono text-xs">
                      {item.netStock.toLocaleString()}
                      <span className="text-ink-muted ml-1">{item.unit}</span>
                    </td>
                    <td className="text-right">
                      <DaysLeft days={item.estimatedDaysLeft} />
                    </td>
                    <td className="hidden md:table-cell text-right font-mono text-xs text-ink-secondary">
                      {item.reorderPoint != null ? item.reorderPoint.toLocaleString() : '—'}
                    </td>
                    <td className="hidden md:table-cell text-right">
                      {item.avgLeadTimeDays != null
                        ? <span className="font-mono text-xs">{item.avgLeadTimeDays}d</span>
                        : <span className="text-ink-muted text-xs">—</span>}
                    </td>
                    <td className="hidden lg:table-cell text-right">
                      {item.lastInDaysAgo != null
                        ? <span className="font-mono text-xs text-ink-secondary">{item.lastInDaysAgo}d ago</span>
                        : <span className="text-ink-muted text-xs">—</span>}
                    </td>
                    <td className="hidden lg:table-cell">
                      <Sparkline data={item.sparkline} anomalous={item.isAnomalous} />
                    </td>
                    <td className="text-center">
                      {item.isAnomalous ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                                     bg-status-critBg text-status-critical border border-status-critical/30
                                     whitespace-nowrap"
                          title={item.anomalyReason}
                        >
                          ⚠ {item.anomalyReason}
                        </span>
                      ) : needsReorder ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                                         bg-status-lowBg text-status-low border border-status-low/30">
                          ! Reorder
                        </span>
                      ) : (
                        <span className="text-ink-muted text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted text-xs">
            Page {page} of {totalPages} · {filtered.length} items
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="wms-btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="wms-btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

    </div>
  );
}