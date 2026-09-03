/**
 * lib/trends.ts — pure computation of consumption frequency, lead times,
 * reorder urgency and anomaly flags. No I/O.
 */

import { differenceInDays, subDays } from 'date-fns';
import { parseSheetDate, ALL_LOCATIONS, defaultLocation } from './sheets';
import type { Transaction, ItemMaster, Location, TrendItem } from './types';

export function computeTrends(
  transactions: Transaction[],
  items: ItemMaster[],
  locations: Location[],
  days: number,
  locationId: string = ALL_LOCATIONS,
): TrendItem[] {
  const rollup = locationId === ALL_LOCATIONS;
  const def = defaultLocation(locations);
  const itemMap = new Map(items.map((i) => [i.itemName.trim().toLowerCase(), i]));
  const now = new Date();
  const windowStart = subDays(now, days);

  // Scope rows: company-wide ignores transfers (they are not consumption / restock);
  // a single location treats transfer-in as a refill and transfer-out as usage.
  const scoped = transactions.filter((t) => {
    const loc = t.locationId || def?.id || '';
    if (rollup) return t.movement !== 'TRANSFER_IN' && t.movement !== 'TRANSFER_OUT';
    return loc === locationId;
  });

  const grouped = new Map<string, Transaction[]>();
  for (const t of scoped) {
    const key = t.itemName.trim().toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  const results: TrendItem[] = [];
  for (const [key, txns] of grouped.entries()) {
    const master = itemMap.get(key);
    const itemName = master?.itemName ?? txns[0].itemName;
    const category = master?.category ?? 'General';
    const unit = master?.defaultUnit ?? txns[0].unit;

    const dateOf = (t: Transaction) => parseSheetDate(t.actualDateTime) || parseSheetDate(t.logDateTime);
    const inTxns  = txns.filter((t) => t.type === 'IN');
    const outTxns = txns.filter((t) => t.type === 'OUT');

    const inWindow  = inTxns.filter((t) => { const d = dateOf(t); return d && d >= windowStart; });
    const outWindow = outTxns.filter((t) => { const d = dateOf(t); return d && d >= windowStart; });

    const inTotal  = inTxns.reduce((s, t) => s + t.quantity, 0);
    const outTotal = outTxns.reduce((s, t) => s + t.quantity, 0);
    const netStock = Math.max(0, inTotal - outTotal);

    const outPerDay = outWindow.reduce((s, t) => s + t.quantity, 0) / days;
    const inPerDay  = inWindow.reduce((s, t) => s + t.quantity, 0) / days;

    const inDates = inTxns.map(dateOf).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    let avgLeadTimeDays: number | null = master?.avgLeadTimeDays ?? null;
    if (!avgLeadTimeDays && inDates.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < inDates.length; i++) gaps.push(differenceInDays(inDates[i], inDates[i - 1]));
      avgLeadTimeDays = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    }

    const lastInDate = inDates.length ? inDates[inDates.length - 1] : null;
    const lastInDaysAgo = lastInDate ? differenceInDays(now, lastInDate) : null;

    const estimatedDaysLeft = outPerDay > 0 && netStock > 0 ? Math.floor(netStock / outPerDay) : null;
    const reorderPoint = master?.reorderPoint
      ?? (avgLeadTimeDays && outPerDay > 0 ? Math.ceil(avgLeadTimeDays * outPerDay * 1.2) : null);

    const sparkline: number[] = Array(30).fill(0);
    for (const t of outTxns) {
      const d = dateOf(t); if (!d) continue;
      const ago = differenceInDays(now, d);
      if (ago >= 0 && ago < 30) sparkline[29 - ago] += t.quantity;
    }

    const last7   = sparkline.slice(23).reduce((s, v) => s + v, 0) / 7;
    const prior23 = sparkline.slice(0, 23).reduce((s, v) => s + v, 0) / 23;
    let isAnomalous = false; let anomalyReason = '';
    if (prior23 > 0) {
      const ratio = last7 / prior23;
      if (ratio > 2.5) { isAnomalous = true; anomalyReason = `Usage up ${Math.round(ratio * 100 - 100)}% vs normal`; }
      else if (last7 === 0 && outTotal > 0) { isAnomalous = true; anomalyReason = 'No usage in 7 days (unusual)'; }
    }
    if (estimatedDaysLeft !== null && estimatedDaysLeft <= 3 && netStock > 0) {
      isAnomalous = true;
      anomalyReason = anomalyReason || `Stockout in ~${estimatedDaysLeft}d`;
    }

    results.push({
      itemName, category, unit,
      inTotal, inPerDay, inPerWeek: inPerDay * 7, inPerMonth: inPerDay * 30,
      outTotal, outPerDay, outPerWeek: outPerDay * 7, outPerMonth: outPerDay * 30,
      avgLeadTimeDays, lastInDaysAgo, daysSinceLastReorder: lastInDaysAgo,
      reorderPoint, netStock, estimatedDaysLeft,
      isAnomalous, anomalyReason, sparkline,
    });
  }

  return results.sort((a, b) => {
    if (a.isAnomalous !== b.isAnomalous) return a.isAnomalous ? -1 : 1;
    const aD = a.estimatedDaysLeft ?? 9999, bD = b.estimatedDaysLeft ?? 9999;
    if (aD !== bD) return aD - bD;
    return b.outTotal - a.outTotal;
  });
}
