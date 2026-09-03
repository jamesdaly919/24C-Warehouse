/**
 * GET /api/stock?company=24c[&location=24C-PA-OUT]
 * Computed stock levels — rolled up across locations by default.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeCurrentStock, ALL_LOCATIONS } from '@/lib/sheets';
import { requireCompany, isResponse } from '@/lib/request';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = requireCompany(req);
  if (isResponse(company)) return company;
  const location = new URL(req.url).searchParams.get('location') || ALL_LOCATIONS;
  try {
    const stock = await computeCurrentStock(company.id, location);
    return NextResponse.json({ stock, location }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/stock]', err);
    return NextResponse.json({ error: 'Failed to fetch stock data.' }, { status: 500 });
  }
}
