/**
 * POST /api/setup?company=24c | yokohama | all
 * Header: x-admin-passphrase
 *
 * Idempotent initialiser for a company's spreadsheet:
 *  - creates any missing tabs (Transaction Log, Current Stock, Item Master,
 *    Locations, Signatures, Config, Patterns)
 *  - (re)writes header rows, freezes them, applies formatting + validation
 *  - seeds Locations (only when the tab is empty)
 *  - seeds Config with a PIN registry (only when the tab is empty — existing PINs are kept)
 *  - removes the default empty "Sheet1"
 *
 * GET /api/setup?company=…  (same header) — reports which tabs exist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sheetsClient, spreadsheetIdFor, SHEET, TXN_HEADERS, STOCK_HEADERS, ITEM_HEADERS, LOCATION_HEADERS, SIGNATURE_HEADERS, PATTERN_HEADERS } from '@/lib/sheets';
import { COMPANY_LIST, getCompany, type Company } from '@/lib/companies';
import { isAdminRequest } from '@/lib/request';

export const dynamic = 'force-dynamic';

const rgb = (r: number, g: number, b: number) => ({ red: r / 255, green: g / 255, blue: b / 255 });

function targets(req: NextRequest): Company[] | NextResponse {
  const id = new URL(req.url).searchParams.get('company') || 'all';
  if (id === 'all') return COMPANY_LIST;
  const c = getCompany(id);
  return c ? [c] : NextResponse.json({ error: 'Unknown company' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const list = targets(req);
  if (list instanceof NextResponse) return list;
  const out: Record<string, unknown> = {};
  for (const c of list) {
    try {
      const meta = await sheetsClient().spreadsheets.get({ spreadsheetId: spreadsheetIdFor(c) });
      const tabs = meta.data.sheets?.map((s) => s.properties?.title) ?? [];
      out[c.id] = { title: meta.data.properties?.title, tabs, missing: Object.values(SHEET).filter((t) => !tabs.includes(t)) };
    } catch (err: any) {
      out[c.id] = { error: String(err?.message || err) };
    }
  }
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const list = targets(req);
  if (list instanceof NextResponse) return list;

  const results: Record<string, unknown> = {};
  for (const company of list) {
    try {
      results[company.id] = await initialise(company);
    } catch (err: any) {
      console.error(`[POST /api/setup] ${company.id}`, err);
      results[company.id] = { error: String(err?.message || err) };
    }
  }
  return NextResponse.json({ success: true, results });
}

async function initialise(company: Company) {
  const sheets = sheetsClient();
  const spreadsheetId = spreadsheetIdFor(company);

  // 1. Existing tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.map((s) => s.properties?.title ?? '') ?? [];
  const wanted = Object.values(SHEET);
  const toCreate = wanted.filter((t) => !existing.includes(t));

  if (toCreate.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })) },
    });
  }

  const meta2 = await sheets.spreadsheets.get({ spreadsheetId });
  const idOf = new Map<string, number>(
    meta2.data.sheets?.map((s) => [s.properties?.title ?? '', s.properties?.sheetId ?? 0]) ?? [],
  );

  // 2. Which tabs are empty (so we only seed once)
  const read = async (tab: string) => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A:G` });
    return (r.data.values || []) as string[][];
  };
  const [locRows, cfgRows] = await Promise.all([read(SHEET.LOCATIONS), read(SHEET.CONFIG)]);
  const seedLocations = locRows.length <= 1;
  const seedConfig = cfgRows.length === 0;

  // 3. Headers (row 1 is always rewritten — data below is untouched)
  const data: Array<{ range: string; values: unknown[][] }> = [
    { range: `'${SHEET.TRANSACTIONS}'!A1`, values: [TXN_HEADERS] },
    { range: `'${SHEET.STOCK}'!A1`,        values: [STOCK_HEADERS] },
    { range: `'${SHEET.ITEMS}'!A1`,        values: [ITEM_HEADERS] },
    { range: `'${SHEET.LOCATIONS}'!A1`,    values: [LOCATION_HEADERS] },
    { range: `'${SHEET.SIGNATURES}'!A1`,   values: [SIGNATURE_HEADERS] },
    { range: `'${SHEET.PATTERNS}'!A1`,     values: [PATTERN_HEADERS] },
  ];
  if (seedLocations) {
    data.push({
      range: `'${SHEET.LOCATIONS}'!A2`,
      values: company.seedLocations.map((l) => [l.id, l.name, l.type, l.parentId, l.site, 'TRUE', '']),
    });
  }
  if (seedConfig) {
    data.push({
      range: `'${SHEET.CONFIG}'!A1`,
      values: [
        ['Setting', 'Value', 'Notes'],
        ['COMPANY', company.name, company.holding],
        ['ADMIN_EMAILS', process.env.ADMIN_EMAILS || '', 'Comma-separated admin emails (informational — enforced by env)'],
        ['', '', ''],
        ['PINS', '', '── PIN Sign-off Registry ──  (4–6 digits; keep this sheet restricted)'],
        ['PIN', 'Name', 'Email', 'Role (STAFF/ADMIN)'],
        ['1234', 'Sample Staff', 'staff@company.com', 'STAFF'],
      ],
    });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });

  // 4. Formatting
  const requests: any[] = [];
  const headerBg = rgb(15, 23, 42);       // slate-900
  const headerFg = rgb(255, 255, 255);

  for (const tab of wanted) {
    const sheetId = idOf.get(tab);
    if (sheetId == null) continue;
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: headerBg,
            textFormat: { bold: true, fontSize: 10, foregroundColor: headerFg },
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
            padding: { top: 6, bottom: 6, left: 6, right: 6 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy,padding)',
      },
    });
    // Reasonable default column width
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 20 },
        properties: { pixelSize: 150 },
        fields: 'pixelSize',
      },
    });
  }

  // Transaction Log: IN / OUT colouring (col E) and movement colouring (col Q)
  const txnId = idOf.get(SHEET.TRANSACTIONS)!;
  const boolRule = (sheetId: number, col: number, value: string, bg: any, fg: any) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startColumnIndex: col, endColumnIndex: col + 1, startRowIndex: 1 }],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] },
          format: { backgroundColor: bg, textFormat: { foregroundColor: fg, bold: true } },
        },
      },
      index: 0,
    },
  });
  requests.push(
    boolRule(txnId, 4, 'IN',  rgb(220, 252, 231), rgb(21, 128, 61)),
    boolRule(txnId, 4, 'OUT', rgb(254, 226, 226), rgb(185, 28, 28)),
    boolRule(txnId, 16, 'TRANSFER_OUT', rgb(224, 231, 255), rgb(67, 56, 202)),
    boolRule(txnId, 16, 'TRANSFER_IN',  rgb(224, 231, 255), rgb(67, 56, 202)),
    boolRule(txnId, 7, 'YES', rgb(254, 243, 199), rgb(180, 83, 9)),
  );

  // Current Stock: status column (K = index 10)
  const stockId = idOf.get(SHEET.STOCK)!;
  requests.push(
    boolRule(stockId, 10, '🟢 GOOD',     rgb(220, 252, 231), rgb(21, 128, 61)),
    boolRule(stockId, 10, '🟡 LOW',      rgb(254, 243, 199), rgb(180, 83, 9)),
    boolRule(stockId, 10, '🔴 CRITICAL', rgb(254, 226, 226), rgb(185, 28, 28)),
    boolRule(stockId, 10, '⚫ EMPTY',    rgb(241, 245, 249), rgb(71, 85, 105)),
    boolRule(stockId, 13, 'YES',         rgb(254, 243, 199), rgb(180, 83, 9)),
  );

  // Locations: dropdown for Type, checkbox-style validation for Active
  const locId = idOf.get(SHEET.LOCATIONS)!;
  requests.push({
    setDataValidation: {
      range: { sheetId: locId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'WAREHOUSE' }, { userEnteredValue: 'STORAGE' }] },
        showCustomUi: true, strict: true,
      },
    },
  });
  requests.push({
    setDataValidation: {
      range: { sheetId: locId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 5, endColumnIndex: 6 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'TRUE' }, { userEnteredValue: 'FALSE' }] },
        showCustomUi: true, strict: false,
      },
    },
  });
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: locId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
      properties: { pixelSize: 320 }, fields: 'pixelSize',
    },
  });

  // Signatures: keep the data-URL column narrow so the sheet stays usable
  const sigId = idOf.get(SHEET.SIGNATURES)!;
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: sigId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
      properties: { pixelSize: 120 }, fields: 'pixelSize',
    },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: sigId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 },
      cell: { userEnteredFormat: { wrapStrategy: 'CLIP' } },
      fields: 'userEnteredFormat.wrapStrategy',
    },
  });

  // Remove the default empty "Sheet1" once our tabs exist
  const sheet1 = meta2.data.sheets?.find((s) => s.properties?.title === 'Sheet1');
  if (sheet1 && (meta2.data.sheets?.length ?? 0) > 1) {
    const s1 = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'Sheet1'!A1:C3` });
    if (!(s1.data.values || []).length) {
      requests.push({ deleteSheet: { sheetId: sheet1.properties!.sheetId } });
    }
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

  return {
    spreadsheetId,
    tabsCreated: toCreate,
    seededLocations: seedLocations ? company.seedLocations.map((l) => l.id) : [],
    seededConfig: seedConfig,
  };
}
