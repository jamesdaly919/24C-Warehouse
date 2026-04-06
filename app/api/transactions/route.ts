import { NextRequest, NextResponse } from 'next/server';
import { appendTransaction, getItems, addItem, computeCurrentStock, writeSheet, SHEET } from '@/lib/sheets';
import type { TransactionInput } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body: TransactionInput = await req.json();

    // ── Validation ────────────────────────────────────────────────────────────
    const errors: string[] = [];
    if (!body.itemName?.trim())               errors.push('Item name is required');
    if (!body.quantity || body.quantity <= 0) errors.push('Quantity must be > 0');
    if (!body.unit?.trim())                   errors.push('Unit of measure is required');
    if (!['IN', 'OUT'].includes(body.type))   errors.push('Type must be IN or OUT');
    if (!body.actualDateTime)                 errors.push('Date & time is required');
    if (!body.signoffName?.trim())            errors.push('Signoff name is required');
    if (body.isLateEntry && !body.lateEntryReason?.trim()) {
      errors.push('A reason is required for late entries');
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
    }

    // ── Sanitise ──────────────────────────────────────────────────────────────
    const sanitised: TransactionInput = {
      ...body,
      itemName:        body.itemName.trim(),
      unit:            body.unit.trim(),
      signoffName:     body.signoffName.trim(),
      signoffEmail:    body.signoffEmail?.trim() || '—',
      lateEntryReason: body.lateEntryReason?.trim() || '',
      notes:           body.notes?.trim() || '',
      entryType:       body.entryType || 'NORMAL',
    };

    // ── Write transaction ─────────────────────────────────────────────────────
    const txnId = await appendTransaction(sanitised);

    // ── Auto-add to Item Master if new ────────────────────────────────────────
    const existingItems = await getItems();
    const alreadyExists = existingItems.some(
      (i) => i.itemName.toLowerCase() === sanitised.itemName.toLowerCase()
    );

    if (!alreadyExists) {
      await addItem({
        itemName:            sanitised.itemName,
        category:            'General',
        defaultUnit:         sanitised.unit,
        lowThreshold:        0,
        criticalThreshold:   0,
        avgLeadTimeDays:     null,
        avgDailyConsumption: null,
        reorderPoint:        null,
        isAdminAdded:        false,
      });
    }

    // ── Recompute and write Current Stock sheet ───────────────────────────────
    const stock = await computeCurrentStock();

    const STATUS_LABEL: Record<string, string> = {
      GOOD:     '🟢 GOOD',
      LOW:      '🟡 LOW',
      CRITICAL: '🔴 CRITICAL',
      EMPTY:    '⚫ EMPTY',
    };

    const headers = [
      'Item Name', 'Category', 'Total IN', 'Total OUT', 'Net Stock',
      'Unit', 'Low Threshold', 'Critical Threshold', 'Status',
      'Est. Stockout Date', 'Reorder Point', 'Needs Reorder?',
      'Last IN', 'Last OUT', 'Admin Added?',
    ];

    const rows = stock.map((s) => [
      s.itemName,
      s.category,
      s.totalIn,
      s.totalOut,
      s.netStock,
      s.unit,
      s.lowThreshold,
      s.criticalThreshold,
      STATUS_LABEL[s.status] ?? s.status,
      s.estimatedStockoutDate
        ? new Date(s.estimatedStockoutDate).toLocaleDateString('en-PH', { dateStyle: 'medium' })
        : '—',
      s.reorderPoint || '—',
      s.needsReorder ? 'YES' : '—',
      s.lastIn  || '—',
      s.lastOut || '—',
      s.isAdminAdded ? '★ Yes' : 'No',
    ]);

    await writeSheet(SHEET.STOCK, [headers, ...rows]);

    return NextResponse.json({ success: true, txnId }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/transactions]', err);
    return NextResponse.json(
      { error: 'Failed to save transaction. Please try again.' },
      { status: 500 }
    );
  }
}