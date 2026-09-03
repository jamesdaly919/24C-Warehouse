/**
 * GET  /api/locations?company=…  — active warehouses / storage areas (hierarchy-sorted)
 * POST /api/locations?company=…  — admin: add a warehouse or a storage area (x-admin-passphrase)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLocations, addLocation } from '@/lib/sheets';
import { requireCompany, isResponse, isAdminRequest } from '@/lib/request';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = requireCompany(req);
  if (isResponse(company)) return company;
  try {
    const locations = await getLocations(company.id);
    return NextResponse.json({ locations }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/locations]', err);
    return NextResponse.json({ error: 'Failed to fetch locations.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const company = requireCompany(req);
  if (isResponse(company)) return company;
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Location name is required' }, { status: 400 });
    const type = String(body.type || 'WAREHOUSE').toUpperCase() === 'STORAGE' ? 'STORAGE' : 'WAREHOUSE';
    const location = await addLocation(company.id, {
      name, type, parentId: body.parentId ? String(body.parentId) : '', site: body.site, notes: body.notes,
    });
    return NextResponse.json({ success: true, location }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/locations]', err);
    const msg = String(err?.message || '');
    if (/Parent location/.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: 'Failed to add location.' }, { status: 500 });
  }
}
