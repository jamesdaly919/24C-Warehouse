// ─── Shared Types ─────────────────────────────────────────────────────────────

export type TxnType = 'IN' | 'OUT';
export type StockStatus = 'GOOD' | 'LOW' | 'CRITICAL' | 'EMPTY';
export type EntryType = 'NORMAL' | 'ADMIN';

/** Raw transaction as stored in Google Sheets */
export interface Transaction {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  type: TxnType;
  /** The real-world time the event happened (user-provided or auto) */
  actualDateTime: string;
  /** System timestamp: when this row was written to the sheet */
  logDateTime: string;
  isLateEntry: boolean;
  lateEntryReason: string;
  signoffName: string;
  signoffEmail: string;
  /** Base64 PNG of the drawn signature, or empty string */
  signature: string;
  notes: string;
  entryType: EntryType;
}

/** What we receive from the Tab 1 form */
export interface TransactionInput {
  itemName: string;
  quantity: number;
  unit: string;
  type: TxnType;
  actualDateTime: string;
  isLateEntry: boolean;
  lateEntryReason: string;
  signoffName: string;
  signoffEmail: string;
  signature: string;
  notes: string;
  entryType: EntryType;
}

/** Computed stock row for Tab 2 */
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
  /** ISO date string or null */
  estimatedStockoutDate: string | null;
  /** Quantity at which to reorder */
  reorderPoint: number;
  needsReorder: boolean;
  lastIn: string | null;
  lastOut: string | null;
  isAdminAdded: boolean;
  avgLeadTimeDays: number | null;
}

/** Item master record */
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

/** PIN entry stored in Config sheet */
export interface PinEntry {
  pin: string;
  name: string;
  email: string;
  role: 'STAFF' | 'ADMIN';
}

/** Local offline queue entry */
export interface OfflineQueueEntry {
  id: string;            // local UUID
  payload: TransactionInput;
  queuedAt: string;      // ISO timestamp
  retryCount: number;
}
