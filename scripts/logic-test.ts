import { computeStock, formatSheetDate, parseSheetDate, sortLocations } from '../lib/sheets';
import { computeTrends } from '../lib/trends';
import type { Transaction, ItemMaster, Location } from '../lib/types';

const locs: Location[] = [
  { id: '24C-PA-OUT', name: 'Outdoor', type: 'WAREHOUSE', parentId: '', site: 'PA', active: true, notes: '' },
  { id: '24C-PA-IN', name: 'Indoor', type: 'STORAGE', parentId: '24C-PA-OUT', site: 'PA', active: true, notes: '' },
];
const items: ItemMaster[] = [
  { itemId: 'I1', itemName: 'Cooking Oil', category: 'Food', defaultUnit: 'kg', lowThreshold: 20, criticalThreshold: 5, avgLeadTimeDays: null, avgDailyConsumption: null, reorderPoint: null, isAdminAdded: true, firstRecordedDate: '' },
];
const d = (daysAgo: number) => formatSheetDate(new Date(Date.now() - daysAgo * 86400000));
const tx = (o: Partial<Transaction>): Transaction => ({
  id: 'x', itemName: 'Cooking Oil', quantity: 0, unit: 'kg', type: 'IN', actualDateTime: d(0), logDateTime: d(0),
  isLateEntry: false, lateEntryReason: '', signoffName: 'J', signoffEmail: '', signature: '', notes: '', entryType: 'NORMAL',
  locationId: '24C-PA-OUT', locationName: 'Outdoor', movement: 'RECEIPT', counterpartLocationId: '', transferRef: '', ...o,
});
const txns: Transaction[] = [
  tx({ quantity: 100, actualDateTime: d(20), movement: 'RECEIPT' }),
  tx({ quantity: 50, actualDateTime: d(10), movement: 'RECEIPT' }),
  tx({ quantity: 30, type: 'OUT', movement: 'ISSUE', actualDateTime: d(9) }),
  // transfer 40 outdoor -> indoor
  tx({ quantity: 40, type: 'OUT', movement: 'TRANSFER_OUT', counterpartLocationId: '24C-PA-IN', transferRef: 'T1', actualDateTime: d(5) }),
  tx({ quantity: 40, type: 'IN', movement: 'TRANSFER_IN', locationId: '24C-PA-IN', locationName: 'Indoor', counterpartLocationId: '24C-PA-OUT', transferRef: 'T1', actualDateTime: d(5) }),
  tx({ quantity: 15, type: 'OUT', movement: 'ISSUE', locationId: '24C-PA-IN', locationName: 'Indoor', actualDateTime: d(2) }),
  // legacy row w/o location
  tx({ quantity: 5, type: 'OUT', movement: 'ISSUE', locationId: '', actualDateTime: d(1) }),
];

const all = computeStock(txns, items, locs, 'ALL')[0];
const out = computeStock(txns, items, locs, '24C-PA-OUT')[0];
const inn = computeStock(txns, items, locs, '24C-PA-IN')[0];
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

assert(all.totalIn === 150 && all.totalOut === 50 && all.netStock === 100, `rollup excludes transfers: in=${all.totalIn} out=${all.totalOut} net=${all.netStock}`);
assert(out.netStock === 75, `outdoor net = 75 (got ${out.netStock})`);
assert(inn.netStock === 25, `indoor net = 25 (got ${inn.netStock})`);
assert(all.byLocation!.find(b => b.locationId === '24C-PA-OUT')!.netStock === 75, 'rollup breakdown outdoor 75');
assert(all.byLocation!.find(b => b.locationId === '24C-PA-IN')!.netStock === 25, 'rollup breakdown indoor 25');
assert(all.status === 'GOOD' && inn.status === 'GOOD', 'status thresholds');
assert(all.avgLeadTimeDays === 10, `lead time from receipts = 10 (got ${all.avgLeadTimeDays})`);
assert(inn.avgLeadTimeDays === null, 'indoor has single refill → no lead time yet');

const tAll = computeTrends(txns, items, locs, 30, 'ALL')[0];
const tIn = computeTrends(txns, items, locs, 30, '24C-PA-IN')[0];
assert(Math.abs(tAll.outPerDay - 50 / 30) < 1e-9, `company usage/day = ${tAll.outPerDay.toFixed(3)}`);
assert(tIn.inTotal === 40 && tIn.outTotal === 15, `indoor trends count transfer-in as refill (in=${tIn.inTotal} out=${tIn.outTotal})`);

const p = parseSheetDate('2026-09-03 14:22')!;
assert(p.toISOString() === '2026-09-03T06:22:00.000Z', `parse Manila → UTC ${p.toISOString()}`);
assert(formatSheetDate('2026-09-03T06:22:00.000Z') === '2026-09-03 14:22', 'format UTC → Manila');
assert(parseSheetDate('Apr 6, 2026 — 2:34 PM') !== null, 'legacy date parses');
const sorted = sortLocations([locs[1], locs[0]]);
assert(sorted[0].id === '24C-PA-OUT' && sorted[1].id === '24C-PA-IN', 'hierarchy sort parent first');
