'use client';

import { useState, useEffect, useCallback } from 'react';
import type { StockItem, ItemMaster } from '@/lib/types';

interface CurrentStockProps {
  isAdmin?: boolean;
}

type SortKey = 'status' | 'itemName' | 'netStock' | 'estimatedStockoutDate';

const STATUS_ORDER = { EMPTY: 0, CRITICAL: 1, LOW: 2, GOOD: 3 };
const STATUS_LABEL: Record<StockItem['status'], string> = {
  GOOD:     '🟢 GOOD',
  LOW:      '🟡 LOW',
  CRITICAL: '🔴 CRITICAL',
  EMPTY:    '⚫ EMPTY',
};

export default function CurrentStock({ isAdmin }: CurrentStockProps) {
  const [stock,         setStock]         = useState<StockItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [search,        setSearch]        = useState('');
  const [sortKey,       setSortKey]       = useState<SortKey>('status');
  const [sortAsc,       setSortAsc]       = useState(true);
  const [filterStatus,  setFilterStatus]  = useState<StockItem['status'] | 'ALL'>('ALL');
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Admin panel
  const [adminOpen,     setAdminOpen]     = useState(false);
  const [adminPass,     setAdminPass]     = useState('');
  const [adminAuthed,   setAdminAuthed]   = useState(false);
  const [adminError,    setAdminError]    = useState('');
  const [addItemForm,   setAddItemForm]   = useState({
    itemName: '', category: 'General', defaultUnit: '',
    lowThreshold: '', criticalThreshold: '', avgLeadTimeDays: '',
  });
  const [addItemState, setAddItemState]   = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [addItemError, setAddItemError]   = useState('');

  // ── Fetch stock ────────────────────────────────────────────────────────────
  const fetchStock = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stock');
      if (!res.ok) throw new Error('Failed to load stock data');
      const data = await res.json();
      setStock(data.stock || []);
      setLastRefreshed(new Date().toLocaleTimeString('en-PH', { timeStyle: 'short' }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStock();
    // Auto-refresh every 90 seconds
    const iv = setInterval(fetchStock, 90_000);
    return () => clearInterval(iv);
  }, [fetchStock]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const summary = {
    total:    stock.length,
    good:     stock.filter((s) => s.status === 'GOOD').length,
    low:      stock.filter((s) => s.status === 'LOW').length,
    critical: stock.filter((s) => s.status === 'CRITICAL').length,
    empty:    stock.filter((s) => s.status === 'EMPTY').length,
    reorder:  stock.filter((s) => s.needsReorder).length,
  };

  const filtered = stock
    .filter((s) =>
      (filterStatus === 'ALL' || s.status === filterStatus) &&
      (s.itemName.toLowerCase().includes(search.toLowerCase()) ||
       s.category.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'status')       cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (sortKey === 'itemName')     cmp = a.itemName.localeCompare(b.itemName);
      if (sortKey === 'netStock')     cmp = a.netStock - b.netStock;
      if (sortKey === 'estimatedStockoutDate') {
        const aD = a.estimatedStockoutDate ? new Date(a.estimatedStockoutDate).getTime() : Infinity;
        const bD = b.estimatedStockoutDate ? new Date(b.estimatedStockoutDate).getTime() : Infinity;
        cmp = aD - bD;
      }
      return sortAsc ? cmp : -cmp;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-ink-muted ml-1">↕</span>;
    return <span className="text-amber-400 ml-1">{sortAsc ? '↑' : '↓'}</span>;
  }

  // ── Admin auth ─────────────────────────────────────────────────────────────
  async function handleAdminAuth() {
    // We verify passphrase by attempting to fetch items with it
    const res = await fetch('/api/items', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-passphrase': adminPass },
      body:    JSON.stringify({ itemName: '__TEST__', defaultUnit: 'pcs' }), // will fail validation but auth check runs first
    });
    if (res.status !== 401) {
      setAdminAuthed(true);
      setAdminError('');
    } else {
      setAdminError('Incorrect passphrase');
    }
  }

  async function handleAddItem() {
    setAddItemState('saving');
    setAddItemError('');
    try {
      const res = await fetch('/api/items', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-passphrase': adminPass },
        body:    JSON.stringify({
          ...addItemForm,
          lowThreshold:      parseFloat(addItemForm.lowThreshold) || 0,
          criticalThreshold: parseFloat(addItemForm.criticalThreshold) || 0,
          avgLeadTimeDays:   addItemForm.avgLeadTimeDays ? parseFloat(addItemForm.avgLeadTimeDays) : null,
        }),
      });
      if (res.ok) {
        setAddItemState('done');
        setAddItemForm({ itemName: '', category: 'General', defaultUnit: '', lowThreshold: '', criticalThreshold: '', avgLeadTimeDays: '' });
        fetchStock();
      } else {
        const d = await res.json();
        throw new Error(d.error);
      }
    } catch (e: any) {
      setAddItemState('error');
      setAddItemError(e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-20 animate-fade-in">

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: 'Total Items',  value: summary.total,    color: 'text-ink-primary' },
          { label: 'Good',         value: summary.good,     color: 'text-status-good' },
          { label: 'Low',          value: summary.low,      color: 'text-status-low' },
          { label: 'Critical',     value: summary.critical, color: 'text-status-critical' },
          { label: 'Empty',        value: summary.empty,    color: 'text-status-empty' },
          { label: 'Needs Reorder',value: summary.reorder,  color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="wms-card p-3 text-center">
            <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
            <div className="text-xs text-ink-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          className="wms-input flex-1"
          placeholder="Search items or categories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2 flex-wrap">
          {(['ALL', 'GOOD', 'LOW', 'CRITICAL', 'EMPTY'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-2 rounded border transition-colors
                ${filterStatus === s
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'border-bg-border text-ink-secondary hover:border-bg-hover'}`}
            >
              {s === 'ALL' ? 'All' : STATUS_LABEL[s as StockItem['status']]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={fetchStock} className="wms-btn-secondary text-xs px-3">
            ↺ Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setAdminOpen(true)}
              className="wms-btn-secondary text-xs px-3 border-amber-500/30 text-amber-400"
            >
              ★ Admin
            </button>
          )}
        </div>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-ink-muted text-right">Last updated {lastRefreshed}</p>
      )}

      {/* ── Loading / Error ────────────────────────────────────────────────── */}
      {loading && (
        <div className="py-16 text-center text-ink-secondary text-sm animate-pulse">
          Loading stock data…
        </div>
      )}
      {error && (
        <div className="p-4 bg-status-critBg border border-status-critical/30 rounded text-status-critical text-sm">
          {error}
        </div>
      )}

      {/* ── Stock Table ────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div className="wms-card overflow-x-auto">
          <table className="wms-table w-full">
            <thead>
              <tr>
                <th onClick={() => toggleSort('itemName')} className="cursor-pointer whitespace-nowrap">
                  Item <SortIcon k="itemName" />
                </th>
                <th className="hidden sm:table-cell">Category</th>
                <th onClick={() => toggleSort('netStock')} className="cursor-pointer whitespace-nowrap text-right">
                  Stock <SortIcon k="netStock" />
                </th>
                <th className="hidden md:table-cell text-right">Total IN</th>
                <th className="hidden md:table-cell text-right">Total OUT</th>
                <th onClick={() => toggleSort('status')} className="cursor-pointer whitespace-nowrap">
                  Status <SortIcon k="status" />
                </th>
                <th className="hidden lg:table-cell whitespace-nowrap" onClick={() => toggleSort('estimatedStockoutDate')}>
                  Est. Stockout <SortIcon k="estimatedStockoutDate" />
                </th>
                <th className="hidden lg:table-cell text-right">Reorder At</th>
                <th className="hidden sm:table-cell text-center">Reorder?</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-ink-muted py-12">
                    No items match your filter
                  </td>
                </tr>
              )}
              {filtered.map((item) => (
                <tr
                  key={item.itemName}
                  className={`
                    ${item.status === 'EMPTY'    ? 'bg-status-emptyBg/40' : ''}
                    ${item.status === 'CRITICAL' ? 'bg-status-critBg/40'  : ''}
                  `}
                >
                  {/* Item name */}
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-ink-primary font-body">
                        {item.itemName}
                      </span>
                      {item.isAdminAdded && (
                        <span className="text-amber-400 text-xs" title="Admin-added item">★</span>
                      )}
                    </div>
                  </td>

                  {/* Category */}
                  <td className="hidden sm:table-cell text-ink-secondary">{item.category}</td>

                  {/* Net stock */}
                  <td className="text-right">
                    <span className={`font-semibold ${
                      item.netStock === 0       ? 'text-status-empty'    :
                      item.status === 'CRITICAL' ? 'text-status-critical' :
                      item.status === 'LOW'      ? 'text-status-low'      :
                      'text-ink-primary'
                    }`}>
                      {item.netStock.toLocaleString()}
                    </span>
                    {' '}
                    <span className="text-ink-muted text-xs">{item.unit}</span>
                  </td>

                  {/* Totals */}
                  <td className="hidden md:table-cell text-right text-txn-in text-xs">
                    +{item.totalIn.toLocaleString()}
                  </td>
                  <td className="hidden md:table-cell text-right text-txn-out text-xs">
                    −{item.totalOut.toLocaleString()}
                  </td>

                  {/* Status badge */}
                  <td>
                    <span className={`
                      inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold
                      ${item.status === 'GOOD'     ? 'badge-good'     : ''}
                      ${item.status === 'LOW'      ? 'badge-low'      : ''}
                      ${item.status === 'CRITICAL' ? 'badge-critical' : ''}
                      ${item.status === 'EMPTY'    ? 'badge-empty'    : ''}
                    `}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </td>

                  {/* Est. stockout */}
                  <td className="hidden lg:table-cell">
                    {item.estimatedStockoutDate
                      ? <StockoutCountdown date={item.estimatedStockoutDate} />
                      : <span className="text-ink-muted">—</span>}
                  </td>

                  {/* Reorder point */}
                  <td className="hidden lg:table-cell text-right text-ink-secondary text-xs">
                    {item.reorderPoint > 0 ? item.reorderPoint.toLocaleString() : '—'}
                  </td>

                  {/* Needs reorder */}
                  <td className="hidden sm:table-cell text-center">
                    {item.needsReorder
                      ? <span className="text-amber-400 text-sm reorder-pulse font-bold" title="Reorder needed">!</span>
                      : <span className="text-ink-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Admin Panel Modal ────────────────────────────────────────────────── */}
      {adminOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setAdminOpen(false); }}
        >
          <div className="wms-card w-full max-w-md p-6 shadow-panel space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-amber-400">★ Admin Panel</h2>
              <button onClick={() => setAdminOpen(false)} className="text-ink-muted hover:text-ink-primary text-xl">×</button>
            </div>

            {!adminAuthed ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-secondary">Enter your admin passphrase to continue.</p>
                <input
                  type="password"
                  className="wms-input"
                  placeholder="Admin passphrase"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminAuth()}
                />
                {adminError && <p className="text-xs text-status-critical">{adminError}</p>}
                <button onClick={handleAdminAuth} className="wms-btn-primary w-full">
                  Unlock
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-ink-secondary flex items-center gap-1">
                  <span className="text-status-good">✓</span> Authenticated — items added here are flagged ★
                </p>

                {/* Add Item Form */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="wms-label">Item Name *</label>
                      <input className="wms-input" placeholder="e.g. Latex Gloves M"
                        value={addItemForm.itemName}
                        onChange={(e) => setAddItemForm({ ...addItemForm, itemName: e.target.value })} />
                    </div>
                    <div>
                      <label className="wms-label">Category</label>
                      <input className="wms-input" placeholder="General"
                        value={addItemForm.category}
                        onChange={(e) => setAddItemForm({ ...addItemForm, category: e.target.value })} />
                    </div>
                    <div>
                      <label className="wms-label">Unit *</label>
                      <input className="wms-input" placeholder="pcs, kg…"
                        value={addItemForm.defaultUnit}
                        onChange={(e) => setAddItemForm({ ...addItemForm, defaultUnit: e.target.value })} />
                    </div>
                    <div>
                      <label className="wms-label">Low Threshold</label>
                      <input type="number" className="wms-input" placeholder="50"
                        value={addItemForm.lowThreshold}
                        onChange={(e) => setAddItemForm({ ...addItemForm, lowThreshold: e.target.value })} />
                    </div>
                    <div>
                      <label className="wms-label">Critical Threshold</label>
                      <input type="number" className="wms-input" placeholder="10"
                        value={addItemForm.criticalThreshold}
                        onChange={(e) => setAddItemForm({ ...addItemForm, criticalThreshold: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="wms-label">Avg Lead Time (days)</label>
                      <input type="number" className="wms-input" placeholder="e.g. 7"
                        value={addItemForm.avgLeadTimeDays}
                        onChange={(e) => setAddItemForm({ ...addItemForm, avgLeadTimeDays: e.target.value })} />
                    </div>
                  </div>

                  {addItemError && (
                    <p className="text-xs text-status-critical">{addItemError}</p>
                  )}
                  {addItemState === 'done' && (
                    <p className="text-xs text-status-good">✓ Item added successfully</p>
                  )}

                  <button
                    onClick={handleAddItem}
                    disabled={addItemState === 'saving'}
                    className="wms-btn-primary w-full"
                  >
                    {addItemState === 'saving' ? 'Saving…' : '★ Add Item to Master'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stockout Countdown ─────────────────────────────────────────────────────────
function StockoutCountdown({ date }: { date: string }) {
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <span className="text-status-critical text-xs font-semibold">Overdue</span>;
  if (days === 0) return <span className="text-status-critical text-xs font-semibold">Today</span>;
  if (days <= 3)  return <span className="text-status-critical text-xs font-semibold">{days}d</span>;
  if (days <= 7)  return <span className="text-status-low text-xs">{days}d</span>;
  return <span className="text-ink-secondary text-xs">{days}d</span>;
}
