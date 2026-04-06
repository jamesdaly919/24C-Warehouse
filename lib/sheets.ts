/**
 * lib/sheets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All Google Sheets read/write operations.
 * Uses a Service Account (key stored as Base64 env var) for server-side auth.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { google, sheets_v4 } from 'googleapis';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import type { Transaction, TransactionInput, StockItem, ItemMaster, PinEntry } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!;

export const SHEET = {
  TRANSACTIONS: 'Transaction Log',
  STOCK:        'Current Stock',
  ITEMS:        'Item Master',
  CONFIG:       'Config',
  PATTERNS:     'Patterns',
} as const;

// Column headers for Transaction Log (must match appendTransaction order)
export const TXN_HEADERS = [
  'Transaction ID',
  'Item Name',
  'Quantity',
  'Unit',
  'Type (IN/OUT)',
  'Actual Date & Time',
  'Log Date & Time',
  'Late Entry?',
  'Late Entry Reason',
  'Signoff Name',
  'Signoff Email',
  'Signature (link/base64)',
  'Notes',
  'Entry Type',
];

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getAuth() {
  const raw = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64!,
    'base64'
  ).toString('utf-8');
  const credentials = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function sheets(): Promise<sheets_v4.Sheets> {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Human-readable date for Sheet cells */
export function humanDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, yyyy — h:mm a");
  } catch {
    return iso;
  }
}

/** Generate unique transaction ID */
export function generateTxnId(): string {
  const datePart = format(new Date(), 'yyyyMMdd');
  const randPart = Math.floor(Math.random() * 9000 + 1000).toString();
  return `TXN-${datePart}-${randPart}`;
}

// ─── Generic Sheet Operations ─────────────────────────────────────────────────

export async function getSheetValues(sheetName: string): Promise<string[][]> {
  const s = await sheets();
  const res = await s.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A:Z`,
  });
  return (res.data.values || []) as string[][];
}

export async function appendRows(sheetName: string, rows: unknown[][]): Promise<void> {
  const s = await sheets();
  await s.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

export async function writeSheet(sheetName: string, rows: unknown[][]): Promise<void> {
  const s = await sheets();
  // Clear first
  await s.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A:Z`,
  });
  if (rows.length === 0) return;
  await s.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function appendTransaction(input: TransactionInput): Promise<string> {
  const id = generateTxnId();
  const now = new Date().toISOString();

  const row: unknown[] = [
    id,
    input.itemName,
    input.quantity,
    input.unit,
    input.type,
    humanDate(input.actualDateTime),       // col F — the real event time
    humanDate(now),                         // col G — system log time (always now)
    input.isLateEntry ? 'YES' : 'NO',      // col H
    input.isLateEntry ? input.lateEntryReason : '—', // col I
    input.signoffName,                     // col J
    input.signoffEmail,                    // col K
    input.signature ? '[Signature captured]' : '—', // col L (base64 too large for cell; see note)
    input.notes || '—',                    // col M
    input.entryType,                       // col N
  ];

  await appendRows(SHEET.TRANSACTIONS, [row]);
  return id;
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const rows = await getSheetValues(SHEET.TRANSACTIONS);
  if (rows.length < 2) return [];

  // Skip header row (index 0)
  return rows.slice(1).map((r) => ({
    id:               r[0]  || '',
    itemName:         r[1]  || '',
    quantity:         parseFloat(r[2]) || 0,
    unit:             r[3]  || '',
    type:             (r[4] as 'IN' | 'OUT') || 'IN',
    actualDateTime:   r[5]  || '',
    logDateTime:      r[6]  || '',
    isLateEntry:      r[7]  === 'YES',
    lateEntryReason:  r[8]  || '',
    signoffName:      r[9]  || '',
    signoffEmail:     r[10] || '',
    signature:        r[11] || '',
    notes:            r[12] || '',
    entryType:        (r[13] as 'NORMAL' | 'ADMIN') || 'NORMAL',
  }));
}

// ─── Item Master ──────────────────────────────────────────────────────────────

export async function getItems(): Promise<ItemMaster[]> {
  const rows = await getSheetValues(SHEET.ITEMS);
  if (rows.length < 2) return [];

  return rows.slice(1).map((r) => ({
    itemId:               r[0] || '',
    itemName:             r[1] || '',
    category:             r[2] || '',
    defaultUnit:          r[3] || '',
    lowThreshold:         parseFloat(r[4]) || 0,
    criticalThreshold:    parseFloat(r[5]) || 0,
    avgLeadTimeDays:      r[6] ? parseFloat(r[6]) : null,
    avgDailyConsumption:  r[7] ? parseFloat(r[7]) : null,
    reorderPoint:         r[8] ? parseFloat(r[8]) : null,
    isAdminAdded:         r[9] === 'TRUE',
    firstRecordedDate:    r[10] || '',
  }));
}

export async function addItem(item: Omit<ItemMaster, 'itemId' | 'firstRecordedDate'>): Promise<void> {
  const items = await getItems();
  const newId = `ITEM-${String(items.length + 1).padStart(4, '0')}`;
  const row = [
    newId,
    item.itemName,
    item.category,
    item.defaultUnit,
    item.lowThreshold,
    item.criticalThreshold,
    item.avgLeadTimeDays ?? '',
    item.avgDailyConsumption ?? '',
    item.reorderPoint ?? '',
    item.isAdminAdded ? 'TRUE' : 'FALSE',
    humanDate(new Date().toISOString()),
  ];
  await appendRows(SHEET.ITEMS, [row]);
}

// ─── Stock Computation ────────────────────────────────────────────────────────

/**
 * Computes current stock from the Transaction Log + Item Master.
 * This is the source of truth for Tab 2.
 */
export async function computeCurrentStock(): Promise<StockItem[]> {
  const [transactions, items] = await Promise.all([
    getAllTransactions(),
    getItems(),
  ]);

  const itemMap = new Map<string, ItemMaster>(
    items.map((i) => [i.itemName.toLowerCase(), i])
  );

  // Aggregate per item
  const agg = new Map<string, {
    totalIn: number; totalOut: number;
    lastIn: string | null; lastOut: string | null;
    inDates: Date[];
  }>();

  for (const txn of transactions) {
    const key = txn.itemName.toLowerCase();
    if (!agg.has(key)) {
      agg.set(key, { totalIn: 0, totalOut: 0, lastIn: null, lastOut: null, inDates: [] });
    }
    const entry = agg.get(key)!;
    if (txn.type === 'IN') {
      entry.totalIn += txn.quantity;
      entry.lastIn = txn.actualDateTime;
      // Try to parse the actual date for lead time calculations
      try {
        // Our stored dates are human-formatted; parse best-effort
        entry.inDates.push(new Date(txn.logDateTime || txn.actualDateTime));
      } catch { /* ignore parse errors */ }
    } else {
      entry.totalOut += txn.quantity;
      entry.lastOut = txn.actualDateTime;
    }
  }

  // Build output
  const results: StockItem[] = [];

  // Process items that exist in master
  for (const item of items) {
    const key = item.itemName.toLowerCase();
    const stats = agg.get(key) ?? { totalIn: 0, totalOut: 0, lastIn: null, lastOut: null, inDates: [] };
    const netStock = Math.max(0, stats.totalIn - stats.totalOut);

    // Determine status
    let status: StockItem['status'];
    if (netStock <= 0)                        status = 'EMPTY';
    else if (netStock <= item.criticalThreshold) status = 'CRITICAL';
    else if (netStock <= item.lowThreshold)      status = 'LOW';
    else                                         status = 'GOOD';

    // Compute avg daily consumption (last 30 days of OUT transactions)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOuts = transactions
      .filter((t) => t.itemName.toLowerCase() === key && t.type === 'OUT')
      .reduce((sum, t) => sum + t.quantity, 0);
    const avgDailyConsumption = item.avgDailyConsumption ?? (recentOuts / 30);

    // Compute avg lead time from IN date gaps
    let avgLeadTimeDays: number | null = item.avgLeadTimeDays;
    if (!avgLeadTimeDays && stats.inDates.length >= 2) {
      const sorted = [...stats.inDates].sort((a, b) => a.getTime() - b.getTime());
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(differenceInDays(sorted[i], sorted[i - 1]));
      }
      avgLeadTimeDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    }

    // Reorder point = (avg lead time * avg daily consumption) + safety buffer (20%)
    const reorderPoint = item.reorderPoint
      ?? (avgLeadTimeDays && avgDailyConsumption
          ? Math.ceil(avgLeadTimeDays * avgDailyConsumption * 1.2)
          : item.lowThreshold);

    // Projected stockout date
    let estimatedStockoutDate: string | null = null;
    if (avgDailyConsumption > 0 && netStock > 0) {
      const daysLeft = Math.floor(netStock / avgDailyConsumption);
      estimatedStockoutDate = addDays(new Date(), daysLeft).toISOString();
    }

    results.push({
      itemName:              item.itemName,
      category:              item.category,
      totalIn:               stats.totalIn,
      totalOut:              stats.totalOut,
      netStock,
      unit:                  item.defaultUnit,
      lowThreshold:          item.lowThreshold,
      criticalThreshold:     item.criticalThreshold,
      status,
      estimatedStockoutDate,
      reorderPoint,
      needsReorder:          netStock <= reorderPoint,
      lastIn:                stats.lastIn,
      lastOut:               stats.lastOut,
      isAdminAdded:          item.isAdminAdded,
      avgLeadTimeDays,
    });

    agg.delete(key); // remove processed
  }

  // Items in transactions but NOT yet in master (auto-discovered)
  for (const [key, stats] of agg.entries()) {
    const netStock = Math.max(0, stats.totalIn - stats.totalOut);
    results.push({
      itemName:              key,
      category:              'Uncategorised',
      totalIn:               stats.totalIn,
      totalOut:              stats.totalOut,
      netStock,
      unit:                  '—',
      lowThreshold:          0,
      criticalThreshold:     0,
      status:                netStock <= 0 ? 'EMPTY' : 'GOOD',
      estimatedStockoutDate: null,
      reorderPoint:          0,
      needsReorder:          false,
      lastIn:                stats.lastIn,
      lastOut:               stats.lastOut,
      isAdminAdded:          false,
      avgLeadTimeDays:       null,
    });
  }

  return results.sort((a, b) => {
    // Sort by urgency: EMPTY → CRITICAL → LOW → GOOD
    const order = { EMPTY: 0, CRITICAL: 1, LOW: 2, GOOD: 3 };
    return order[a.status] - order[b.status];
  });
}

// ─── PIN Lookup ───────────────────────────────────────────────────────────────

export async function getPins(): Promise<PinEntry[]> {
  const rows = await getSheetValues(SHEET.CONFIG);
  if (rows.length < 2) return [];

  // PIN section starts after a row with "PINS" in col A
  const pinStart = rows.findIndex((r) => r[0]?.toUpperCase() === 'PINS');
  if (pinStart === -1) return [];

  return rows
    .slice(pinStart + 2) // skip header row after PINS
    .filter((r) => r[0] && r[1])
    .map((r) => ({
      pin:   r[0],
      name:  r[1],
      email: r[2] || '',
      role:  (r[3] as 'STAFF' | 'ADMIN') || 'STAFF',
    }));
}

export async function lookupPin(pin: string): Promise<PinEntry | null> {
  const pins = await getPins();
  return pins.find((p) => p.pin === pin) ?? null;
}
