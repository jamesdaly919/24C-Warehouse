/**
 * GET  /api/items  — Returns the item master list (names + units for dropdown)
 * POST /api/items  — Admin: adds a new item to the Item Master sheet
 */

import { NextRequest, NextResponse } from 'next/server';
import { getItems, addItem } from '@/lib/sheets';
import type { ItemMaster } from '@/lib/types';

export async function GET() {
  try {
    const items = await getItems();
    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/items]', err);
    return NextResponse.json({ error: 'Failed to fetch items.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin passphrase (server-side check)
    const passphrase = req.headers.get('x-admin-passphrase');
    if (passphrase !== process.env.ADMIN_PASSPHRASE) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json();
    const errors: string[] = [];
    if (!body.itemName?.trim())   errors.push('Item name is required');
    if (!body.defaultUnit?.trim()) errors.push('Unit is required');
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
    }

    const newItem: Omit<ItemMaster, 'itemId' | 'firstRecordedDate'> = {
      itemName:            body.itemName.trim(),
      category:            body.category?.trim() || 'General',
      defaultUnit:         body.defaultUnit.trim(),
      lowThreshold:        parseFloat(body.lowThreshold) || 0,
      criticalThreshold:   parseFloat(body.criticalThreshold) || 0,
      avgLeadTimeDays:     body.avgLeadTimeDays ? parseFloat(body.avgLeadTimeDays) : null,
      avgDailyConsumption: body.avgDailyConsumption ? parseFloat(body.avgDailyConsumption) : null,
      reorderPoint:        body.reorderPoint ? parseFloat(body.reorderPoint) : null,
      isAdminAdded:        true,
    };

    await addItem(newItem);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/items]', err);
    return NextResponse.json({ error: 'Failed to add item.' }, { status: 500 });
  }
}
