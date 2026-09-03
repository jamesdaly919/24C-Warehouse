/**
 * POST /api/transactions?company=24c
 * Logs an IN, OUT or TRANSFER movement, auto-registers new items,
 * and rebuilds the Current Stock tab for that company.
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendTransaction, getItems, addItem, getLocations, rebuildStockSheet } from '@/lib/sheets';
import { requireCompany, isResponse } from '@/lib/request';
import type { TransactionInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const company = requireCompany(req);
  if (isResponse(company)) return company;

  try {
    const body = (await req.json()) as Partial<TransactionInput>;

    const kind = body.kind === 'TRANSFER' ? 'TRANSFER' : body.kind === 'OUT' ? 'OUT' : body.kind === 'IN' ? 'IN' : null;
    const errors: string[] = [];
    if (!kind)                                   errors.push('Movement must be IN, OUT or TRANSFER');
    if (!body.locationId)                        errors.push('Location is required');
    if (kind === 'TRANSFER' && !body.toLocationId) errors.push('Destination location is required for a transfer');
    if (!body.itemName?.trim())                  errors.push('Item name is required');
    if (!body.quantity || body.quantity <= 0)    errors.push('Quantity must be greater than 0');
    if (!body.unit?.trim())                      errors.push('Unit of measure is required');
    if (!body.actualDateTime)                    errors.push('Date & time is required');
    if (!body.signoffName?.trim())               errors.push('Signoff name is required');
    if (body.isLateEntry && !body.lateEntryReason?.trim()) errors.push('A reason is required for late entries');
    if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 400 });

    const input: TransactionInput = {
      company:         company.id,
      locationId:      String(body.locationId),
      toLocationId:    body.toLocationId ? String(body.toLocationId) : undefined,
      kind:            kind!,
      itemName:        body.itemName!.trim(),
      quantity:        Number(body.quantity),
      unit:            body.unit!.trim(),
      actualDateTime:  body.actualDateTime!,
      isLateEntry:     !!body.isLateEntry,
      lateEntryReason: body.lateEntryReason?.trim() || '',
      signoffName:     body.signoffName!.trim(),
      signoffEmail:    body.signoffEmail?.trim() || '',
      signature:       typeof body.signature === 'string' ? body.signature : '',
      notes:           body.notes?.trim() || '',
      entryType:       body.entryType === 'ADMIN' ? 'ADMIN' : 'NORMAL',
    };

    const locations = await getLocations(company.id);
    const txnIds = await appendTransaction(input, locations);

    // Auto-register unknown items so they appear in dropdowns next time
    const existing = await getItems(company.id);
    if (!existing.some((i) => i.itemName.toLowerCase() === input.itemName.toLowerCase())) {
      await addItem(company.id, {
        itemName: input.itemName, category: 'General', defaultUnit: input.unit,
        lowThreshold: 0, criticalThreshold: 0, avgLeadTimeDays: null,
        avgDailyConsumption: null, reorderPoint: null, isAdminAdded: false,
      });
    }

    await rebuildStockSheet(company.id);

    return NextResponse.json({ success: true, txnId: txnIds[0], txnIds }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/transactions]', err);
    const msg = String(err?.message || '');
    const friendly = /Unknown location|Destination|must differ/.test(msg) ? msg : 'Failed to save transaction. Please try again.';
    return NextResponse.json({ error: friendly }, { status: /Unknown location|Destination|must differ/.test(msg) ? 400 : 500 });
  }
}
