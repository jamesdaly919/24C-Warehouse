/**
 * GET /api/trends
 * Computes per-item consumption frequency, lead times, reorder urgency,
 * and pattern deviation flags from the Transaction Log.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllTransactions, getItems } from '@/lib/sheets';
import { differenceInDays, parseISO, isValid, subDays } from 'date-fns';

export interface TrendItem {
  itemName:        string;
  category:        string;
  unit:            string;

  // Frequency — IN
  inTotal:         number;
  inPerDay:        number;
  inPerWeek:       number;
  inPerMonth:      number;

  // Frequency — OUT
  outTotal:        number;
  outPerDay:       number;
  outPerWeek:      number;
  outPerMonth:     number;

  // Reorder intelligence
  avgLeadTimeDays:       number | null;
  lastInDaysAgo:         number | null;
  daysSinceLastReorder:  number | null;
  reorderPoint:          number | null;
  netStock:              number;
  estimatedDaysLeft:     number | null;

  // Pattern deviation
  isAnomalous:     boolean;
  anomalyReason:   string;

  // Sparkline data (last 30 days, daily OUT counts)
  sparkline:       number[];
}

function tryParseDate(str: string): Date | null {
  if (!str || str === '—') return null;
  // Our stored format: "Apr 6, 2026 — 2:34 PM"
  // Try direct parse first
  const d = new Date(str.replace(' — ', ' '));
  if (isValid(d)) return d;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');

    const [transactions, items] = await Promise.all([
      getAllTransactions(),
      getItems(),
    ]);

    const itemMap = new Map(items.map((i) => [i.itemName.toLowerCase(), i]));
    const now = new Date();
    const windowStart = subDays(now, days);

    // Group transactions by item
    const grouped = new Map<string, typeof transactions>();
    for (const txn of transactions) {
      const key = txn.itemName.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(txn);
    }

    const results: TrendItem[] = [];

    for (const [key, txns] of grouped.entries()) {
      const master = itemMap.get(key);
      const itemName = master?.itemName ?? txns[0].itemName;
      const category = master?.category ?? 'General';
      const unit = master?.defaultUnit ?? txns[0].unit;

      const inTxns  = txns.filter((t) => t.type === 'IN');
      const outTxns = txns.filter((t) => t.type === 'OUT');

      // Window-filtered
      const windowOut = outTxns.filter((t) => {
        const d = tryParseDate(t.actualDateTime || t.logDateTime);
        return d && d >= windowStart;
      });
      const windowIn = inTxns.filter((t) => {
        const d = tryParseDate(t.actualDateTime || t.logDateTime);
        return d && d >= windowStart;
      });

      const inTotal  = inTxns.reduce((s, t) => s + t.quantity, 0);
      const outTotal = outTxns.reduce((s, t) => s + t.quantity, 0);
      const netStock = Math.max(0, inTotal - outTotal);

      const windowOutQty = windowOut.reduce((s, t) => s + t.quantity, 0);
      const windowInQty  = windowIn.reduce((s, t) => s + t.quantity, 0);

      const outPerDay   = windowOutQty / days;
      const outPerWeek  = outPerDay * 7;
      const outPerMonth = outPerDay * 30;
      const inPerDay    = windowInQty / days;
      const inPerWeek   = inPerDay * 7;
      const inPerMonth  = inPerDay * 30;

      // Lead time — average gap between IN events
      const inDates = inTxns
        .map((t) => tryParseDate(t.actualDateTime || t.logDateTime))
        .filter(Boolean)
        .sort((a, b) => a!.getTime() - b!.getTime()) as Date[];

      let avgLeadTimeDays: number | null = master?.avgLeadTimeDays ?? null;
      if (!avgLeadTimeDays && inDates.length >= 2) {
        const gaps = [];
        for (let i = 1; i < inDates.length; i++) {
          gaps.push(differenceInDays(inDates[i], inDates[i - 1]));
        }
        avgLeadTimeDays = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
      }

      const lastInDate = inDates.length > 0 ? inDates[inDates.length - 1] : null;
      const lastInDaysAgo = lastInDate ? differenceInDays(now, lastInDate) : null;
      const daysSinceLastReorder = lastInDaysAgo;

      const estimatedDaysLeft = outPerDay > 0 && netStock > 0
        ? Math.floor(netStock / outPerDay)
        : null;

      const reorderPoint = master?.reorderPoint
        ?? (avgLeadTimeDays && outPerDay > 0
            ? Math.ceil(avgLeadTimeDays * outPerDay * 1.2)
            : null);

      // Sparkline — last 30 days daily OUT qty
      const sparkline: number[] = Array(30).fill(0);
      for (const t of outTxns) {
        const d = tryParseDate(t.actualDateTime || t.logDateTime);
        if (!d) continue;
        const daysAgo = differenceInDays(now, d);
        if (daysAgo >= 0 && daysAgo < 30) {
          sparkline[29 - daysAgo] += t.quantity;
        }
      }

      // Pattern deviation — compare last 7 days vs prior 23 days average
      const last7  = sparkline.slice(23).reduce((s, v) => s + v, 0) / 7;
      const prior23 = sparkline.slice(0, 23).reduce((s, v) => s + v, 0) / 23;
      let isAnomalous = false;
      let anomalyReason = '';

      if (prior23 > 0) {
        const ratio = last7 / prior23;
        if (ratio > 2.5) {
          isAnomalous = true;
          anomalyReason = `Consumption ↑ ${Math.round(ratio * 100 - 100)}% above normal`;
        } else if (ratio < 0.2 && last7 === 0 && outTotal > 0) {
          isAnomalous = true;
          anomalyReason = 'No consumption in 7 days (unusual)';
        }
      }

      // Flag if critically close to stockout
      if (estimatedDaysLeft !== null && estimatedDaysLeft <= 3 && netStock > 0) {
        isAnomalous = true;
        anomalyReason = anomalyReason || `Stockout in ~${estimatedDaysLeft}d`;
      }

      results.push({
        itemName, category, unit,
        inTotal, inPerDay, inPerWeek, inPerMonth,
        outTotal, outPerDay, outPerWeek, outPerMonth,
        avgLeadTimeDays, lastInDaysAgo, daysSinceLastReorder,
        reorderPoint, netStock, estimatedDaysLeft,
        isAnomalous, anomalyReason,
        sparkline,
      });
    }

    // Sort: anomalous first, then by days left ascending, then by out volume
    results.sort((a, b) => {
      if (a.isAnomalous !== b.isAnomalous) return a.isAnomalous ? -1 : 1;
      const aD = a.estimatedDaysLeft ?? 9999;
      const bD = b.estimatedDaysLeft ?? 9999;
      if (aD !== bD) return aD - bD;
      return b.outTotal - a.outTotal;
    });

    return NextResponse.json({ trends: results, days }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/trends]', err);
    return NextResponse.json({ error: 'Failed to compute trends.' }, { status: 500 });
  }
}