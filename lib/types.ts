// ─── Shared Types ─────────────────────────────────────────────────────────────

import type { CompanyId } from './companies';

export type TxnType = 'IN' | 'OUT';
/** What the user chose on the form. TRANSFER writes two rows (OUT + IN). */
export type MovementKind = 'IN' | 'OUT' | 'TRANSFER';
/** What a single stored row means */
export type Movement = 'RECEIPT' | 'ISSUE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT';
export type StockStatus = 'GOOD' | 'LOW' | 'CRITICAL' | 'EMPTY';
export type EntryType = 'NORMAL' | 'ADMIN';
export type LocationType = 'WAREHOUSE' | 'STORAGE';

/** A warehouse or a storage area. STORAGE areas usually hang off a WAREHOUSE. */
export interface Location {
  id: string;
  name: string;
  type: LocationType;
  /** Empty for top-level warehouses */
  parentId: string;
  site: string;
  active: boolean;
  notes: string;
}

/** Raw transaction as stored in Google Sheets (one row) */
export interface Transaction {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  type: TxnType;
  actualDateTime: string;
  logDateTime: string;
  isLateEntry: boolean;
  lateEntryReason: string;
  signoffName: string;
  signoffEmail: string;
  signature: string;
  notes: string;
  entryType: EntryType;
  // v2 columns
  locationId: string;
  locationName: string;
  movement: Movement;
  /** For transfers: the other location; shared ref links the two rows */
  counterpartLocationId: string;
  transferRef: string;
}

/** What we receive from the Log form */
export interface TransactionInput {
  company: CompanyId;
  locationId: string;
  /** Required when kind === 'TRANSFER' */
  toLocationId?: string;
  kind: MovementKind;
  itemName: string;
  quantity: number;
  unit: string;
  actualDateTime: string;
  isLateEntry: boolean;
  lateEntryReason: string;
  signoffName: string;
  signoffEmail: string;
  /** data-URL PNG or '' */
  signature: string;
  notes: string;
  entryType: EntryType;
}

/** Computed stock row */
export interface StockItem {
  itemName: string;
  category: string;
  totalIn: number;
  totalOut: number;
  netStock: number;
  unit: string;
  lowThreshold: number;
  criticalThreshold: number;
  status: StockStatus;
  estimatedStockoutDate: string | null;
  reorderPoint: number;
  needsReorder: boolean;
  lastIn: string | null;
  lastOut: string | null;
  isAdminAdded: boolean;
  avgLeadTimeDays: number | null;
  /** Per-location breakdown (only present on rolled-up rows) */
  byLocation?: Array<{ locationId: string; locationName: string; netStock: number }>;
}

export interface ItemMaster {
  itemId: string;
  itemName: string;
  category: string;
  defaultUnit: string;
  lowThreshold: number;
  criticalThreshold: number;
  avgLeadTimeDays: number | null;
  avgDailyConsumption: number | null;
  reorderPoint: number | null;
  isAdminAdded: boolean;
  firstRecordedDate: string;
}

export interface PinEntry {
  pin: string;
  name: string;
  email: string;
  role: 'STAFF' | 'ADMIN';
}

export interface OfflineQueueEntry {
  id: string;
  payload: TransactionInput;
  queuedAt: string;
  retryCount: number;
}

export interface TrendItem {
  itemName: string;
  category: string;
  unit: string;
  inTotal: number;
  inPerDay: number;
  inPerWeek: number;
  inPerMonth: number;
  outTotal: number;
  outPerDay: number;
  outPerWeek: number;
  outPerMonth: number;
  avgLeadTimeDays: number | null;
  lastInDaysAgo: number | null;
  daysSinceLastReorder: number | null;
  reorderPoint: number | null;
  netStock: number;
  estimatedDaysLeft: number | null;
  isAnomalous: boolean;
  anomalyReason: string;
  /** last 30 days, daily OUT qty */
  sparkline: number[];
}
