/**
 * GET /api/stock
 * Returns computed current stock levels for all items.
 */

import { NextResponse } from 'next/server';
import { computeCurrentStock } from '@/lib/sheets';

export async function GET() {
  try {
    const stock = await computeCurrentStock();
    return NextResponse.json({ stock }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/stock]', err);
    return NextResponse.json(
      { error: 'Failed to fetch stock data.' },
      { status: 500 }
    );
  }
}

// Revalidate every 60s on Vercel edge cache
export const revalidate = 60;
