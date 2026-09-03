/**
 * lib/sheets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All Google Sheets read/write operations. Every function is scoped to a
 * company — each company has its own spreadsheet (ID resolved from env).
 * Uses a Service Account (key stored as Base64 env var) for server-side auth.
 *
 * Timestamps are written in Asia/Manila (PH / Taipei time, UTC+8) in the
 * sortable form "yyyy-MM-dd HH:mm" so the sheet stays readable AND parseable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { google, sheets_v4 } from 'googleapis';
import { differenceInDays, addDays } from 'date-fns';
import { COMPANIES, type Company, type CompanyId } from './companies';
import type {
  Transaction, TransactionInput, StockItem, ItemMaster, PinEntry,
  Location, Movement, TxnType,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

export const SHEET = {
  TRANSACTIONS: 'Transaction Log',
  STOCK:        'Current Stock',
  ITEMS:        'Item Master',
  LOCATIONS:    'Locations',
  SIGNATURES:   'Signatures',
  CONFIG:       'Config',
  PATTERNS:     'Patterns',
} as const;

export const TXN_HEADERS = [
  'Transaction ID', 'Item Name', 'Quantity', 'Unit', 'Type (IN/OUT)',
  'Actual Date & Time', 'Log Date & Time', 'Late Entry?', 'Late Entry Reason',
  'Signoff Name', 'Signoff Email', 'Signature', 'Notes', 'Entry Type',
  // v2
  'Location ID', 'Location Name', 'Movement', 'Counterpart Location', 'Transfer Ref',
];

export const STOCK_HEADERS = [
  'Location ID', 'Location Name', 'Item Name', 'Category', 'Total IN', 'Total OUT',
  'Net Stock', 'Unit', 'Low Threshold', 'Critical Threshold', 'Status',
  'Est. Stockout Date', 'Reorder Point', 'Needs Reorder?', 'Last IN', 'Last OUT', 'Admin Added?',
];

export const ITEM_HEADERS = [
  'Item ID', 'Item Name', 'Category', 'Default Unit', 'Low Threshold', 'Critical Threshold',
  'Avg Lead Time (days)', 'Avg Daily Consumption', 'Reorder Point', 'Admin Added?', 'First Recorded Date',
];

export const LOCATION_HEADERS = [
  'Location ID', 'Name', 'Type (WAREHOUSE/STORAGE)', 'Parent Location ID', 'Site', 'Active', 'Notes',
];

export const SIGNATURE_HEADERS = ['Transaction ID', 'Signoff Name', 'Logged At', 'Signature (PNG data URL)'];

export const PATTERN_HEADERS = ['Item Name', 'Period', 'Total IN', 'Total OUT', 'Avg IN/Day', 'Avg OUT/Day', 'Deviation Flag', 'Notes'];

/** Max characters a single Sheets cell can hold */
const CELL_LIMIT = 49_000;

// ─── Time zone helpers ────────────────────────────────────────────────────────

export const APP_TZ = process.env.APP_TIMEZONE || 'Asia/Manila';
/** Fixed offset for the app TZ (PH/TW have no DST). Used when parsing back. */
const APP_TZ_OFFSET = process.env.APP_TZ_OFFSET || '+08:00';

/** "yyyy-MM-dd HH:mm" in the app time zone */
export function formatSheetDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return String(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hh = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hh}:${get('minute')}`;
}

/** Parse a sheet timestamp back to a Date. Handles v2 format and legacy "MMM d, yyyy — h:mm a". */
export function parseSheetDate(str: string | undefined | null): Date | null {
  if (!str || str === '—') return null;
  const s = String(str).trim();
  // v2: 2026-09-03 14:22
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${APP_TZ_OFFSET}`);
    return isNaN(d.getTime()) ? null : d;
  }
  // ISO
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // legacy human format
  const d = new Date(s.replace(' — ', ' '));
  return isNaN(d.getTime()) ? null : d;
}

// ─── Auth / client ────────────────────────────────────────────────────────────

function getAuth() {
  const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 || '', 'base64').toString('utf-8');
  const credentials = JSON.parse(raw || '{}');
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

let _client: sheets_v4.Sheets | null = null;
export function sheetsClient(): sheets_v4.Sheets {
  if (!_client) _client = google.sheets({ version: 'v4', auth: getAuth() });
  return _client;
}

/** Resolve the spreadsheet ID for a company (falls back to the legacy var for 24C). */
export function spreadsheetIdFor(company: Company | CompanyId): string {
  const c = typeof company === 'string' ? COMPANIES[company] : company;
  const id = process.env[c.spreadsheetEnv] || (c.id === '24c' ? process.env.GOOGLE_SPREADSHEET_ID : '');
  if (!id) throw new Error(`Missing env var ${c.spreadsheetEnv} for company "${c.name}"`);
  return id;
}

// ─── Generic Sheet Operations ─────────────────────────────────────────────────

export async function getSheetValues(company: CompanyId, sheetName: string): Promise<string[][]> {
  try {
    const res = await sheetsClient().spreadsheets.values.get({
      spreadsheetId: spreadsheetIdFor(company),
      range: `'${sheetName}'!A:Z`,
    });
    return (res.data.values || []) as string[][];
  } catch (err: any) {
    // A missing tab (before setup has run) reads as empty rather than crashing the app
    if (String(err?.message || err).includes('Unable to parse range')) return [];
    throw err;
  }
}

export async function appendRows(company: CompanyId, sheetName: string, rows: unknown[][]): Promise<void> {
  await sheetsClient().spreadsheets.values.append({
    spreadsheetId: spreadsheetIdFor(company),
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

export async function writeSheet(company: CompanyId, sheetName: string, rows: unknown[][]): Promise<void> {
  const s = sheetsClient();
  const spreadsheetId = spreadsheetIdFor(company);
  await s.spreadsheets.values.clear({ spreadsheetId, range: `'${sheetName}'!A:Z` });
  if (rows.length === 0) return;
  await s.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

// ─── IDs ──────────────────────────────────────────────────────────────────────

function datePart(): string {
  return formatSheetDate(new Date()).slice(0, 10).replace(/-/g, '');
}

export function generateTxnId(company: CompanyId): string {
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${COMPANIES[company].prefix}-TXN-${datePart()}-${rand}`;
}

export function generateTransferRef(company: CompanyId): string {
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${COMPANIES[company].prefix}-TRF-${datePart()}-${rand}`;
}

export function slugId(company: CompanyId, name: string, existing: Set<string>): string {
  const base = `${COMPANIES[company].prefix}-` + (
    name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'LOC'
  );
  let id = base; let n = 2;
  while (existing.has(id)) id = `${base}-${n++}`;
  return id;
}

// ─── Locations ────────────────────────────────────────────────────────────────

export async function getLocations(company: CompanyId, includeInactive = false): Promise<Location[]> {
  const rows = await getSheetValues(company, SHEET.LOCATIONS);
  const list = rows.slice(1).filter((r) => r[0] && r[1]).map((r) => ({
    id:       r[0].trim(),
    name:     r[1].trim(),
    type:     (String(r[2] || 'WAREHOUSE').toUpperCase() === 'STORAGE' ? 'STORAGE' : 'WAREHOUSE') as Location['type'],
    parentId: (r[3] || '').trim(),
    site:     r[4] || '',
    active:   String(r[5] ?? 'TRUE').toUpperCase() !== 'FALSE',
    notes:    r[6] || '',
  }));
  const out = includeInactive ? list : list.filter((l) => l.active);
  return sortLocations(out);
}

/** Parents first, children directly under their parent */
export function sortLocations(list: Location[]): Location[] {
  const byParent = new Map<string, Location[]>();
  for (const l of list) {
    const key = list.some((p) => p.id === l.parentId) ? l.parentId : '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(l);
  }
  const out: Location[] = [];
  const walk = (parent: string, depth: number) => {
    for (const l of (byParent.get(parent) || []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(l);
      if (depth < 4) walk(l.id, depth + 1);
    }
  };
  walk('', 0);
  return out;
}

export async function addLocation(
  company: CompanyId,
  input: { name: string; type: Location['type']; parentId?: string; site?: string; notes?: string },
): Promise<Location> {
  const existing = await getLocations(company, true);
  const ids = new Set(existing.map((l) => l.id));
  if (input.parentId && !ids.has(input.parentId)) throw new Error('Parent location not found');
  const loc: Location = {
    id:       slugId(company, input.name, ids),
    name:     input.name.trim(),
    type:     input.type,
    parentId: input.parentId || '',
    site:     input.site?.trim() || '',
    active:   true,
    notes:    input.notes?.trim() || '',
  };
  await appendRows(company, SHEET.LOCATIONS, [[loc.id, loc.name, loc.type, loc.parentId, loc.site, 'TRUE', loc.notes]]);
  return loc;
}

/** First top-level warehouse — used for legacy rows that carry no location */
export function defaultLocation(locations: Location[]): Location | null {
  return locations.find((l) => !l.parentId) ?? locations[0] ?? null;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

function movementFor(kind: TransactionInput['kind'], side: 'from' | 'to'): Movement {
  if (kind === 'IN') return 'RECEIPT';
  if (kind === 'OUT') return 'ISSUE';
  return side === 'from' ? 'TRANSFER_OUT' : 'TRANSFER_IN';
}

/**
 * Writes one row for IN/OUT, two linked rows for TRANSFER.
 * Returns the transaction IDs written (1 or 2).
 */
export async function appendTransaction(input: TransactionInput, locations: Location[]): Promise<string[]> {
  const company = input.company;
  const now = new Date();
  const locById = new Map(locations.map((l) => [l.id, l]));
  const from = locById.get(input.locationId);
  if (!from) throw new Error('Unknown location');

  const to = input.kind === 'TRANSFER' ? locById.get(input.toLocationId || '') : undefined;
  if (input.kind === 'TRANSFER' && !to) throw new Error('Destination location is required for a transfer');
  if (input.kind === 'TRANSFER' && to!.id === from.id) throw new Error('Source and destination must differ');

  const transferRef = input.kind === 'TRANSFER' ? generateTransferRef(company) : '';
  const hasSig = !!input.signature;
  const sigNote = hasSig ? '[Signature captured — see Signatures tab]' : '—';

  const baseRow = (id: string, type: TxnType, loc: Location, movement: Movement, counterpart: string): unknown[] => [
    id,
    input.itemName,
    input.quantity,
    input.unit,
    type,
    formatSheetDate(input.actualDateTime),
    formatSheetDate(now),
    input.isLateEntry ? 'YES' : 'NO',
    input.isLateEntry ? input.lateEntryReason : '—',
    input.signoffName,
    input.signoffEmail || '—',
    sigNote,
    input.notes || '—',
    input.entryType,
    loc.id,
    loc.name,
    movement,
    counterpart || '—',
    transferRef || '—',
  ];

  const ids: string[] = [];
  const rows: unknown[][] = [];
  if (input.kind === 'TRANSFER') {
    const outId = generateTxnId(company); const inId = generateTxnId(company);
    ids.push(outId, inId);
    rows.push(baseRow(outId, 'OUT', from, 'TRANSFER_OUT', to!.id));
    rows.push(baseRow(inId,  'IN',  to!,  'TRANSFER_IN',  from.id));
  } else {
    const id = generateTxnId(company);
    ids.push(id);
    rows.push(baseRow(id, input.kind, from, movementFor(input.kind, 'from'), ''));
  }

  await appendRows(company, SHEET.TRANSACTIONS, rows);

  if (hasSig) {
    const sig = input.signature.length > CELL_LIMIT ? '[Signature too large to store]' : input.signature;
    await appendRows(company, SHEET.SIGNATURES, [[ids[0], input.signoffName, formatSheetDate(now), sig]]);
  }
  return ids;
}

export async function getAllTransactions(company: CompanyId): Promise<Transaction[]> {
  const rows = await getSheetValues(company, SHEET.TRANSACTIONS);
  if (rows.length < 2) return [];
  return rows.slice(1).filter((r) => r[0] && r[1]).map((r) => {
    const type = (String(r[4] || 'IN').toUpperCase() === 'OUT' ? 'OUT' : 'IN') as TxnType;
    const rawMove = String(r[16] || '').toUpperCase() as Movement;
    const movement: Movement = ['RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT'].includes(rawMove)
      ? rawMove
      : (type === 'IN' ? 'RECEIPT' : 'ISSUE');
    return {
      id:               r[0] || '',
      itemName:         r[1] || '',
      quantity:         parseFloat(r[2]) || 0,
      unit:             r[3] || '',
      type,
      actualDateTime:   r[5] || '',
      logDateTime:      r[6] || '',
      isLateEntry:      r[7] === 'YES',
      lateEntryReason:  r[8] || '',
      signoffName:      r[9] || '',
      signoffEmail:     r[10] || '',
      signature:        r[11] || '',
      notes:            r[12] || '',
      entryType:        (r[13] as Transaction['entryType']) || 'NORMAL',
      locationId:       (r[14] || '').trim(),
      locationName:     r[15] || '',
      movement,
      counterpartLocationId: r[17] && r[17] !== '—' ? r[17] : '',
      transferRef:      r[18] && r[18] !== '—' ? r[18] : '',
    };
  });
}

// ─── Item Master ──────────────────────────────────────────────────────────────

export async function getItems(company: CompanyId): Promise<ItemMaster[]> {
  const rows = await getSheetValues(company, SHEET.ITEMS);
  if (rows.length < 2) return [];
  return rows.slice(1).filter((r) => r[1]).map((r) => ({
    itemId:               r[0] || '',
    itemName:             r[1] || '',
    category:             r[2] || 'General',
    defaultUnit:          r[3] || '',
    lowThreshold:         parseFloat(r[4]) || 0,
    criticalThreshold:    parseFloat(r[5]) || 0,
    avgLeadTimeDays:      r[6] ? parseFloat(r[6]) : null,
    avgDailyConsumption:  r[7] ? parseFloat(r[7]) : null,
    reorderPoint:         r[8] ? parseFloat(r[8]) : null,
    isAdminAdded:         String(r[9]).toUpperCase() === 'TRUE',
    firstRecordedDate:    r[10] || '',
  }));
}

export async function addItem(
  company: CompanyId,
  item: Omit<ItemMaster, 'itemId' | 'firstRecordedDate'>,
): Promise<ItemMaster> {
  const items = await getItems(company);
  const nums = items.map((i) => parseInt(i.itemId.replace(/\D/g, ''), 10) || 0);
  const newId = `${COMPANIES[company].prefix}-ITEM-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
  const created: ItemMaster = { ...item, itemId: newId, firstRecordedDate: formatSheetDate(new Date()) };
  await appendRows(company, SHEET.ITEMS, [[
    created.itemId, created.itemName, created.category, created.defaultUnit,
    created.lowThreshold, created.criticalThreshold,
    created.avgLeadTimeDays ?? '', created.avgDailyConsumption ?? '', created.reorderPoint ?? '',
    created.isAdminAdded ? 'TRUE' : 'FALSE', created.firstRecordedDate,
  ]]);
  return created;
}

// ─── Stock Computation ────────────────────────────────────────────────────────

export const ALL_LOCATIONS = 'ALL';

interface Agg {
  totalIn: number; totalOut: number;
  lastIn: string | null; lastOut: string | null;
  inDates: Date[]; outQty30: number;
  perLocation: Map<string, number>;
}

/**
 * Computes stock for one location, or rolled up across all locations
 * (transfers cancel out and are excluded from IN/OUT totals in the rollup).
 */
export function computeStock(
  transactions: Transaction[],
  items: ItemMaster[],
  locations: Location[],
  locationId: string = ALL_LOCATIONS,
): StockItem[] {
  const def = defaultLocation(locations);
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const rollup = locationId === ALL_LOCATIONS;
  const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);

  const agg = new Map<string, Agg>();
  const touch = (key: string) => {
    if (!agg.has(key)) agg.set(key, { totalIn: 0, totalOut: 0, lastIn: null, lastOut: null, inDates: [], outQty30: 0, perLocation: new Map() });
    return agg.get(key)!;
  };

  for (const t of transactions) {
    const loc = t.locationId || def?.id || '';
    const isTransfer = t.movement === 'TRANSFER_IN' || t.movement === 'TRANSFER_OUT';
    const key = t.itemName.trim().toLowerCase();
    const when = parseSheetDate(t.actualDateTime) || parseSheetDate(t.logDateTime);

    if (rollup) {
      // per-location breakdown always includes transfers
      const a = touch(key);
      a.perLocation.set(loc, (a.perLocation.get(loc) || 0) + (t.type === 'IN' ? t.quantity : -t.quantity));
      if (isTransfer) continue;
    } else {
      if (loc !== locationId) continue;
    }

    const a = touch(key);
    if (t.type === 'IN') {
      a.totalIn += t.quantity;
      a.lastIn = t.actualDateTime || a.lastIn;
      if (when) a.inDates.push(when);
    } else {
      a.totalOut += t.quantity;
      a.lastOut = t.actualDateTime || a.lastOut;
      if (when && when >= thirtyAgo) a.outQty30 += t.quantity;
    }
  }

  const build = (item: ItemMaster | null, name: string, a: Agg): StockItem => {
    const netStock = Math.max(0, a.totalIn - a.totalOut);
    const low = item?.lowThreshold ?? 0;
    const crit = item?.criticalThreshold ?? 0;
    let status: StockItem['status'];
    if (netStock <= 0) status = 'EMPTY';
    else if (crit > 0 && netStock <= crit) status = 'CRITICAL';
    else if (low > 0 && netStock <= low) status = 'LOW';
    else status = 'GOOD';

    const avgDaily = item?.avgDailyConsumption ?? (a.outQty30 / 30);

    let avgLead: number | null = item?.avgLeadTimeDays ?? null;
    if (!avgLead && a.inDates.length >= 2) {
      const sorted = [...a.inDates].sort((x, y) => x.getTime() - y.getTime());
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) gaps.push(differenceInDays(sorted[i], sorted[i - 1]));
      avgLead = Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10;
    }

    const reorderPoint = item?.reorderPoint
      ?? (avgLead && avgDaily > 0 ? Math.ceil(avgLead * avgDaily * 1.2) : low);

    let estimatedStockoutDate: string | null = null;
    if (avgDaily > 0 && netStock > 0) {
      estimatedStockoutDate = addDays(new Date(), Math.floor(netStock / avgDaily)).toISOString();
    }

    const byLocation = rollup
      ? [...a.perLocation.entries()]
          .filter(([, q]) => q !== 0)
          .map(([id, q]) => ({ locationId: id, locationName: locName.get(id) || id || 'Unassigned', netStock: Math.max(0, q) }))
      : undefined;

    return {
      itemName: item?.itemName ?? name,
      category: item?.category ?? 'Uncategorised',
      totalIn: a.totalIn, totalOut: a.totalOut, netStock,
      unit: item?.defaultUnit ?? '—',
      lowThreshold: low, criticalThreshold: crit, status,
      estimatedStockoutDate,
      reorderPoint,
      needsReorder: reorderPoint > 0 && netStock <= reorderPoint,
      lastIn: a.lastIn, lastOut: a.lastOut,
      isAdminAdded: item?.isAdminAdded ?? false,
      avgLeadTimeDays: avgLead,
      byLocation,
    };
  };

  const results: StockItem[] = [];
  for (const item of items) {
    const key = item.itemName.trim().toLowerCase();
    const a = agg.get(key);
    // For a single location, only show items that have moved there or exist in master with stock
    if (!a) {
      if (rollup) results.push(build(item, item.itemName, touch(key)));
      continue;
    }
    results.push(build(item, item.itemName, a));
    agg.delete(key);
  }
  for (const [key, a] of agg.entries()) {
    const original = transactions.find((t) => t.itemName.trim().toLowerCase() === key)?.itemName ?? key;
    results.push(build(null, original, a));
  }

  const order = { EMPTY: 0, CRITICAL: 1, LOW: 2, GOOD: 3 };
  return results.sort((x, y) => order[x.status] - order[y.status] || x.itemName.localeCompare(y.itemName));
}

export async function computeCurrentStock(company: CompanyId, locationId: string = ALL_LOCATIONS): Promise<StockItem[]> {
  const [transactions, items, locations] = await Promise.all([
    getAllTransactions(company), getItems(company), getLocations(company, true),
  ]);
  return computeStock(transactions, items, locations, locationId);
}

const STATUS_LABEL: Record<string, string> = {
  GOOD: '🟢 GOOD', LOW: '🟡 LOW', CRITICAL: '🔴 CRITICAL', EMPTY: '⚫ EMPTY',
};

/** Rewrites the Current Stock tab: rollup rows first, then one block per location. */
export async function rebuildStockSheet(company: CompanyId): Promise<void> {
  const [transactions, items, locations] = await Promise.all([
    getAllTransactions(company), getItems(company), getLocations(company, true),
  ]);
  const toRow = (locId: string, locNm: string, s: StockItem): unknown[] => [
    locId, locNm, s.itemName, s.category, s.totalIn, s.totalOut, s.netStock, s.unit,
    s.lowThreshold, s.criticalThreshold, STATUS_LABEL[s.status] ?? s.status,
    s.estimatedStockoutDate ? formatSheetDate(s.estimatedStockoutDate).slice(0, 10) : '—',
    s.reorderPoint || '—', s.needsReorder ? 'YES' : '—',
    s.lastIn || '—', s.lastOut || '—', s.isAdminAdded ? '★ Yes' : 'No',
  ];
  const rows: unknown[][] = [STOCK_HEADERS];
  for (const s of computeStock(transactions, items, locations, ALL_LOCATIONS)) rows.push(toRow('ALL', 'All locations', s));
  for (const loc of locations) {
    for (const s of computeStock(transactions, items, locations, loc.id)) {
      if (s.totalIn === 0 && s.totalOut === 0) continue;
      rows.push(toRow(loc.id, loc.name, s));
    }
  }
  await writeSheet(company, SHEET.STOCK, rows);
}

// ─── PIN Lookup ───────────────────────────────────────────────────────────────

export async function getPins(company: CompanyId): Promise<PinEntry[]> {
  const rows = await getSheetValues(company, SHEET.CONFIG);
  const pinStart = rows.findIndex((r) => String(r[0] || '').toUpperCase() === 'PINS');
  if (pinStart === -1) return [];
  return rows.slice(pinStart + 2).filter((r) => r[0] && r[1]).map((r) => ({
    pin:   String(r[0]).trim(),
    name:  r[1],
    email: r[2] || '',
    role:  (String(r[3] || 'STAFF').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'STAFF'),
  }));
}

export async function lookupPin(company: CompanyId, pin: string): Promise<PinEntry | null> {
  const pins = await getPins(company);
  return pins.find((p) => p.pin === pin) ?? null;
}
