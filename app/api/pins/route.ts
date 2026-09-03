/**
 * POST /api/pins?company=…   body: { pin }
 * Returns the sign-off identity for a PIN registered in that company's Config tab.
 */

import { NextRequest, NextResponse } from 'next/server';
import { lookupPin } from '@/lib/sheets';
import { requireCompany, isResponse } from '@/lib/request';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const company = requireCompany(req);
  if (isResponse(company)) return company;
  try {
    const { pin } = await req.json();
    if (!pin || typeof pin !== 'string' || pin.trim().length < 3) {
      return NextResponse.json({ error: 'Invalid PIN format' }, { status: 400 });
    }
    const entry = await lookupPin(company.id, pin.trim());
    if (!entry) return NextResponse.json({ error: 'PIN not recognised' }, { status: 401 });
    return NextResponse.json({ name: entry.name, email: entry.email, role: entry.role });
  } catch (err) {
    console.error('[POST /api/pins]', err);
    return NextResponse.json({ error: 'PIN lookup failed' }, { status: 500 });
  }
}
