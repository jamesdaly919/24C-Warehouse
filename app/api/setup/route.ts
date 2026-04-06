/**
 * POST /api/setup
 * One-time setup: creates all sheets with headers, formatting, and sample config.
 * Protected by ADMIN_PASSPHRASE.
 * Run once after deploying; safe to re-run (idempotent headers).
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { SHEET, TXN_HEADERS } from '@/lib/sheets';

function getAuth() {
  const raw = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64!,
    'base64'
  ).toString('utf-8');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// RGB color helper for Sheets API
function rgb(r: number, g: number, b: number) {
  return { red: r / 255, green: g / 255, blue: b / 255 };
}

export async function POST(req: NextRequest) {
  const passphrase = req.headers.get('x-admin-passphrase');
  if (passphrase !== process.env.ADMIN_PASSPHRASE) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!;

    // ── Step 1: Get existing sheet names ──────────────────────────────────────
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = meta.data.sheets?.map((s) => s.properties?.title) ?? [];

    // ── Step 2: Create missing sheets ─────────────────────────────────────────
    const sheetNames = Object.values(SHEET);
    const sheetsToCreate = sheetNames.filter((name) => !existingSheets.includes(name));

    if (sheetsToCreate.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: sheetsToCreate.map((title) => ({
            addSheet: { properties: { title } },
          })),
        },
      });
    }

    // ── Step 3: Get updated sheet IDs ─────────────────────────────────────────
    const updatedMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetIdMap = new Map<string, number>(
      updatedMeta.data.sheets?.map((s) => [
        s.properties?.title ?? '',
        s.properties?.sheetId ?? 0,
      ]) ?? []
    );

    // ── Step 4: Write headers ─────────────────────────────────────────────────
    const headerWrites = [
      {
        range: `'${SHEET.TRANSACTIONS}'!A1`,
        values: [TXN_HEADERS],
      },
      {
        range: `'${SHEET.STOCK}'!A1`,
        values: [[
          'Item Name', 'Category', 'Total IN', 'Total OUT', 'Net Stock',
          'Unit', 'Low Threshold', 'Critical Threshold', 'Status',
          'Est. Stockout Date', 'Reorder Point', 'Needs Reorder?',
          'Last IN', 'Last OUT', 'Admin Added?',
        ]],
      },
      {
        range: `'${SHEET.ITEMS}'!A1`,
        values: [[
          'Item ID', 'Item Name', 'Category', 'Default Unit',
          'Low Threshold', 'Critical Threshold',
          'Avg Lead Time (days)', 'Avg Daily Consumption', 'Reorder Point',
          'Admin Added?', 'First Recorded Date',
        ]],
      },
      {
        range: `'${SHEET.CONFIG}'!A1`,
        values: [
          ['Setting', 'Value', 'Notes'],
          ['ADMIN_EMAILS', process.env.ADMIN_EMAILS || '', 'Comma-separated admin emails'],
          ['', '', ''],
          ['PINS', '', '── PIN Signoff Registry ──'],
          ['PIN', 'Name', 'Email', 'Role (STAFF/ADMIN)'],
          ['1234', 'Sample Staff', 'staff@company.com', 'STAFF'],
        ],
      },
      {
        range: `'${SHEET.PATTERNS}'!A1`,
        values: [['Item Name', 'Period', 'Total IN', 'Total OUT', 'Avg IN/Day', 'Avg OUT/Day', 'Deviation Flag', 'Notes']],
      },
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: headerWrites,
      },
    });

    // ── Step 5: Apply formatting ───────────────────────────────────────────────
    const formatRequests: any[] = [];

    for (const sheetName of sheetNames) {
      const sheetId = sheetIdMap.get(sheetName);
      if (sheetId == null) continue;

      // Freeze header row
      formatRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      });

      // Header row: dark background, amber text, bold
      formatRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor:  rgb(18, 21, 26),
              textFormat:       { bold: true, fontSize: 10, foregroundColor: rgb(245, 158, 11) },
              verticalAlignment: 'MIDDLE',
              padding: { top: 8, bottom: 8, left: 8, right: 8 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)',
        },
      });
    }

    // Transaction Log: color IN/OUT column (E)
    const txnSheetId = sheetIdMap.get(SHEET.TRANSACTIONS)!;
    // We'll apply conditional formatting rules for IN (green) / OUT (red)
    formatRequests.push(
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: txnSheetId, startColumnIndex: 4, endColumnIndex: 5, startRowIndex: 1 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'IN' }] },
              format: { backgroundColor: rgb(5, 37, 18), textFormat: { foregroundColor: rgb(34, 197, 94), bold: true } },
            },
          },
          index: 0,
        },
      },
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: txnSheetId, startColumnIndex: 4, endColumnIndex: 5, startRowIndex: 1 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'OUT' }] },
              format: { backgroundColor: rgb(28, 5, 5), textFormat: { foregroundColor: rgb(239, 68, 68), bold: true } },
            },
          },
          index: 1,
        },
      }
    );

    // Current Stock: color Status column (I = index 8) GOOD/LOW/CRITICAL/EMPTY
    const stockSheetId = sheetIdMap.get(SHEET.STOCK)!;
    const statusColors = [
      { value: '🟢 GOOD',     bg: rgb(5, 37, 18),   fg: rgb(34, 197, 94) },
      { value: '🟡 LOW',      bg: rgb(28, 18, 0),    fg: rgb(245, 158, 11) },
      { value: '🔴 CRITICAL', bg: rgb(28, 5, 5),     fg: rgb(239, 68, 68) },
      { value: '⚫ EMPTY',    bg: rgb(17, 19, 24),   fg: rgb(107, 114, 128) },
    ];
    statusColors.forEach(({ value, bg, fg }, idx) => {
      formatRequests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: stockSheetId, startColumnIndex: 8, endColumnIndex: 9, startRowIndex: 1 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] },
              format: { backgroundColor: bg, textFormat: { foregroundColor: fg, bold: true } },
            },
          },
          index: idx,
        },
      });
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: formatRequests },
    });

    return NextResponse.json({
      success: true,
      message: 'Sheets initialised successfully. All headers and formatting applied.',
      sheetsCreated: sheetsToCreate,
    });
  } catch (err) {
    console.error('[POST /api/setup]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
