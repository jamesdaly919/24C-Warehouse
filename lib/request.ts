/**
 * lib/request.ts — small helpers shared by the API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCompany, type Company } from './companies';

/** Reads ?company= (or x-company header). Returns the company or a 400 response. */
export function requireCompany(req: NextRequest): Company | NextResponse {
  const id = new URL(req.url).searchParams.get('company') || req.headers.get('x-company');
  const company = getCompany(id);
  if (!company) {
    return NextResponse.json({ error: 'Unknown or missing company. Use ?company=24c or ?company=yokohama' }, { status: 400 });
  }
  return company;
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

export function isAdminRequest(req: NextRequest): boolean {
  const pass = req.headers.get('x-admin-passphrase');
  return !!process.env.ADMIN_PASSPHRASE && pass === process.env.ADMIN_PASSPHRASE;
}
