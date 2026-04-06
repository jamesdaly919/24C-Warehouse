/**
 * POST /api/pins/lookup
 * Given a PIN, returns the associated name and role.
 * Intentionally does not return the PIN itself in the response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { lookupPin } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    if (!pin || typeof pin !== 'string' || pin.length < 4) {
      return NextResponse.json({ error: 'Invalid PIN format' }, { status: 400 });
    }

    const entry = await lookupPin(pin.trim());
    if (!entry) {
      // Generic error — don't reveal whether PIN exists
      return NextResponse.json({ error: 'PIN not recognised' }, { status: 401 });
    }

    return NextResponse.json({
      name:  entry.name,
      email: entry.email,
      role:  entry.role,
    });
  } catch (err) {
    console.error('[POST /api/pins/lookup]', err);
    return NextResponse.json({ error: 'PIN lookup failed' }, { status: 500 });
  }
}
