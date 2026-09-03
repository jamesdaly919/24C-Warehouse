'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, ALL } from '@/components/CompanyApp';
import { Icon, Stat, StatusBadge, Empty, Alert, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/api-client';
import type { StockItem, StockStatus } from '@/lib/types';

type SortKey = 'status' | 'itemName' | 'netStock' | 'stockout';
const ORDER: Record<StockStatus, number> = { EMPTY: 0, CRITICAL: 1, LOW: 2, GOOD: 3 };

export default function CurrentStock() {
  const { company, locationId, locations, openAdmin } = useApp();
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [asc, setAsc] = useState(true);
  const [filter, setFilter] = useState<StockStatus | 'ALL' | 'REORDER'>('ALL');
  const [updated, setUpdated] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await apiGet<{ stock: StockItem[] }>(company.id, '/api/stock', { location: locationId === ALL ? undefined : locationId });
      setStock(d.stock || []);
      setUpdated(new Date().toLocaleTimeString('en-PH', { timeStyle: 'short' }));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [company.id, locationId]);

  useEffect(() => { load(); const iv = setInterval(load, 90_000); return () => clearInterval(iv); }, [load]);

  const summary = useMemo(() => ({
    total: stock.length,
    good: stock.filter((s) => s.status === 'GOOD').length,
    low: stock.filter((s) => s.status === 'LOW').length,
    critical: stock.filter((s) => s.status === 'CRITICAL').length,
    empty: stock.filter((s) => s.status === 'EMPTY').length,
    reorder: stock.filter((s) => s.needsReorder).length,
  }), [stock]);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return stock
      .filter((s) => (filter === 'ALL' || (filter === 'REORDER' ? s.needsReorder : s.status === filter)))
      .filter((s) => !q || s.itemName.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      .sort((a, b) => {
        let c = 0;
        if (sortKey === 'status') c = ORDER[a.status] - ORDER[b.status] || a.itemName.localeCompare(b.itemName);
        if (sortKey === 'itemName') c = a.itemName.localeCompare(b.itemName);
        if (sortKey === 'netStock') c = a.netStock - b.netStock;
        if (sortKey === 'stockout') c = (a.estimatedStockoutDate ? +new Date(a.estimatedStockoutDate) : Infinity) - (b.estimatedStockoutDate ? +new Date(b.estimatedStockoutDate) : Infinity);
        return asc ? c : -c;
      });
  }, [stock, search, filter, sortKey, asc]);

  const sort = (k: SortKey) => { if (sortKey === k) setAsc((a) => !a); else { setSortKey(k); setAsc(true); } };
  const Th = ({ k, children, className = '' }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`${k ? 'cursor-pointer select-none hover:text-ink' : ''} ${className}`} onClick={k ? () => sort(k) : undefined}>
      <span className="inline-flex items-center gap-1">{children}{k && sortKey === k && <span className="text-brand">{asc ? '↑' : '↓'}</span>}</span>
    </th>
  );

  const scopeLabel = locationId === ALL ? 'All locations' : (locations.find((l) => l.id === locationId)?.name ?? locationId);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat label="Items" value={summary.total} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
        <Stat label="Good" value={summary.good} tone="good" active={filter === 'GOOD'} onClick={() => setFilter('GOOD')} />
        <Stat label="Low" value={summary.low} tone="low" active={filter === 'LOW'} onClick={() => setFilter('LOW')} />
        <Stat label="Critical" value={summary.critical} tone="critical" active={filter === 'CRITICAL'} onClick={() => setFilter('CRITICAL')} />
        <Stat label="Empty" value={summary.empty} tone="empty" active={filter === 'EMPTY'} onClick={() => setFilter('EMPTY')} />
        <Stat label="Reorder" value={summary.reorder} tone="brand" active={filter === 'REORDER'} onClick={() => setFilter('REORDER')} />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input type="search" className="input pl-9" placeholder="Search items or categories…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <span className="badge-neutral"><Icon name="pin" size={12} />{scopeLabel}</span>
          {updated && <span className="hidden sm:inline">Updated {updated}</span>}
          <button onClick={load} className="btn-secondary btn-sm" title="Refresh"><Icon name="refresh" size={15} /><span className="sm:hidden">Refresh</span></button>
          <button onClick={openAdmin} className="btn-secondary btn-sm"><Icon name="plus" size={15} /> Item</button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && stock.length === 0 ? (
        <div className="card py-16 text-center text-ink-3 text-sm flex items-center justify-center gap-2"><Spinner /> Loading stock…</div>
      ) : rows.length === 0 ? (
        <div className="card"><Empty title={stock.length === 0 ? 'No stock yet' : 'Nothing matches this filter'}
               hint={stock.length === 0 ? 'Log an IN entry to start tracking items at this location.' : undefined} /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <Th k="itemName">Item</Th>
                  <Th className="hidden md:table-cell">Category</Th>
                  <Th k="netStock" className="text-right">On hand</Th>
                  <Th className="hidden lg:table-cell text-right">In / Out</Th>
                  <Th k="status">Status</Th>
                  <Th k="stockout" className="hidden sm:table-cell">Runs out</Th>
                  <Th className="hidden lg:table-cell text-right">Reorder at</Th>
                  <Th className="hidden lg:table-cell text-right">Lead time</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const canExpand = locationId === ALL && (s.byLocation?.length ?? 0) > 0;
                  const isOpen = expanded === s.itemName;
                  return (
                    <RowGroup key={s.itemName} open={isOpen}>
                      <tr className={`${s.status === 'CRITICAL' || s.status === 'EMPTY' ? 'bg-critical-bg/40' : ''} ${canExpand ? 'cursor-pointer' : ''}`}
                          onClick={canExpand ? () => setExpanded(isOpen ? null : s.itemName) : undefined}>
                        <td>
                          <div className="flex items-center gap-2">
                            {canExpand && <Icon name="chevron-right" size={14} className={`text-ink-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
                            <div className="min-w-0">
                              <div className="font-semibold flex items-center gap-1.5">
                                {s.itemName}
                                {s.needsReorder && <span className="text-brand" title="Reorder needed"><Icon name="alert" size={14} /></span>}
                              </div>
                              <div className="text-xs text-ink-3 md:hidden">{s.category}</div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden md:table-cell text-ink-2">{s.category}</td>
                        <td className="text-right whitespace-nowrap">
                          <span className={`tnum font-bold text-base ${s.status === 'EMPTY' ? 'text-empty' : s.status === 'CRITICAL' ? 'text-critical' : s.status === 'LOW' ? 'text-low' : ''}`}>{s.netStock.toLocaleString()}</span>
                          <span className="text-ink-3 text-xs ml-1">{s.unit}</span>
                        </td>
                        <td className="hidden lg:table-cell text-right tnum text-xs whitespace-nowrap">
                          <span className="text-move-in">+{s.totalIn.toLocaleString()}</span>
                          <span className="text-ink-4 mx-1">/</span>
                          <span className="text-move-out">−{s.totalOut.toLocaleString()}</span>
                        </td>
                        <td><StatusBadge status={s.status} /></td>
                        <td className="hidden sm:table-cell"><Countdown iso={s.estimatedStockoutDate} /></td>
                        <td className="hidden lg:table-cell text-right tnum text-ink-2">{s.reorderPoint > 0 ? s.reorderPoint.toLocaleString() : '—'}</td>
                        <td className="hidden lg:table-cell text-right tnum text-ink-2">{s.avgLeadTimeDays != null ? `${s.avgLeadTimeDays}d` : '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-canvas">
                          <td colSpan={8} className="!py-2.5">
                            <div className="flex flex-wrap gap-2 pl-6">
                              {s.byLocation!.map((b) => (
                                <span key={b.locationId} className="badge-neutral bg-surface">
                                  <Icon name="pin" size={11} />{b.locationName}
                                  <span className="tnum font-bold ml-1">{b.netStock.toLocaleString()}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </RowGroup>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RowGroup({ children }: { children: React.ReactNode; open: boolean }) { return <>{children}</>; }

function Countdown({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-ink-4">—</span>;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  const cls = days <= 3 ? 'text-critical font-semibold' : days <= 7 ? 'text-low font-semibold' : 'text-ink-2';
  const label = days < 0 ? 'Overdue' : days === 0 ? 'Today' : `~${days}d`;
  return <span className={`tnum text-sm ${cls}`}>{label}</span>;
}
