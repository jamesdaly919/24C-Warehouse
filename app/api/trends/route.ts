/**
 * GET /api/trends?company=24c&days=30[&location=…]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllTransactions, getItems, getLocations, ALL_LOCATIONS } from '@/lib/sheets';
import { computeTrends } from '@/lib/trends';
import { requireCompany, isResponse } from '@/lib/request';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const company = requireCompany(req);
  if (isResponse(company)) return company;
  const params = new URL(req.url).searchParams;
  const days = Math.min(365, Math.max(7, parseInt(params.get('days') || '30', 10) || 30));
  const location = params.get('location') || ALL_LOCATIONS;
  try {
    const [transactions, items, locations] = await Promise.all([
      getAllTransactions(company.id), getItems(company.id), getLocations(company.id, true),
    ]);
    const trends = computeTrends(transactions, items, locations, days, location);
    return NextResponse.json({ trends, days, location }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/trends]', err);
    return NextResponse.json({ error: 'Failed to compute trends.' }, { status: 500 });
  }
}
