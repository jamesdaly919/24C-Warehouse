/**
 * GET  /api/items?company=…  — item master (for dropdowns)
 * POST /api/items?company=…  — admin: add an item (x-admin-passphrase)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getItems, addItem } from '@/lib/sheets';
import { requireCompany, isResponse, isAdminRequest } from '@/lib/request';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = requireCompany(req);
  if (isResponse(company)) return company;
  try {
    const items = await getItems(company.id);
    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/items]', err);
    return NextResponse.json({ error: 'Failed to fetch items.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const company = requireCompany(req);
  if (isResponse(company)) return company;
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const body = await req.json();
    const errors: string[] = [];
    if (!body.itemName?.trim())    errors.push('Item name is required');
    if (!body.defaultUnit?.trim()) errors.push('Unit is required');
    if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 400 });

    const existing = await getItems(company.id);
    if (existing.some((i) => i.itemName.toLowerCase() === String(body.itemName).trim().toLowerCase())) {
      return NextResponse.json({ error: 'An item with that name already exists' }, { status: 409 });
    }

    const item = await addItem(company.id, {
      itemName:            String(body.itemName).trim(),
      category:            body.category?.trim() || 'General',
      defaultUnit:         String(body.defaultUnit).trim(),
      lowThreshold:        parseFloat(body.lowThreshold) || 0,
      criticalThreshold:   parseFloat(body.criticalThreshold) || 0,
      avgLeadTimeDays:     body.avgLeadTimeDays ? parseFloat(body.avgLeadTimeDays) : null,
      avgDailyConsumption: body.avgDailyConsumption ? parseFloat(body.avgDailyConsumption) : null,
      reorderPoint:        body.reorderPoint ? parseFloat(body.reorderPoint) : null,
      isAdminAdded:        true,
    });
    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/items]', err);
    return NextResponse.json({ error: 'Failed to add item.' }, { status: 500 });
  }
}
