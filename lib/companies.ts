/**
 * lib/companies.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Registry of EMHCO sub-businesses served by this app.
 * Each company has its own Google Sheet (separate permissions / tidiness).
 * Safe to import from both server and client code — no secrets here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type CompanyId = 'yokohama' | '24c';

export interface Company {
  id: CompanyId;
  /** Trading name shown to staff */
  name: string;
  /** Holding / operating company */
  holding: string;
  /** Short tagline shown under the brand on the picker */
  tagline: string;
  /** Path under /public */
  logo: string;
  /** Holding company logo under /public */
  holdingLogo: string;
  /** Brand colours (drive the CSS custom properties) */
  brand: string;        // primary accent
  brandDark: string;    // hover / pressed
  brandSoft: string;    // tinted backgrounds
  onBrand: string;      // text on brand
  /** Name of the env var that holds this company's spreadsheet ID */
  spreadsheetEnv: string;
  /** Prefix for auto-generated IDs (locations, transactions) */
  prefix: string;
  /** Seed locations created by /api/setup */
  seedLocations: Array<{ id: string; name: string; type: 'WAREHOUSE' | 'STORAGE'; parentId: string; site: string }>;
}

export const COMPANIES: Record<CompanyId, Company> = {
  yokohama: {
    id: 'yokohama',
    name: 'Yokohama',
    holding: 'Dynatek Alignment Specialist',
    tagline: 'Tyres, parts & service consumables',
    logo: '/brands/yokohama.png',
    holdingLogo: '/brands/dynatek.png',
    brand: '#E30613',
    brandDark: '#B8050F',
    brandSoft: '#FDECEE',
    onBrand: '#FFFFFF',
    spreadsheetEnv: 'SPREADSHEET_ID_YOKOHAMA',
    prefix: 'YK',
    seedLocations: [
      { id: 'YK-MAIN', name: 'Main Warehouse', type: 'WAREHOUSE', parentId: '', site: 'Dynatek' },
    ],
  },
  '24c': {
    id: '24c',
    name: '24 Chicken',
    holding: 'House of Martin Food Inc.',
    tagline: 'Food, packaging & store supplies',
    logo: '/brands/24chicken.png',
    holdingLogo: '/brands/house-of-martin.jpg',
    brand: '#D7261E',
    brandDark: '#B01D17',
    brandSoft: '#FDEDEC',
    onBrand: '#FFFFFF',
    spreadsheetEnv: 'SPREADSHEET_ID_24C',
    prefix: '24C',
    seedLocations: [
      { id: '24C-PA-OUT', name: 'Philippine Arena — Outdoor Warehouse', type: 'WAREHOUSE', parentId: '', site: 'Philippine Arena' },
      { id: '24C-PA-IN',  name: 'Philippine Arena — Indoor Storage',    type: 'STORAGE',   parentId: '24C-PA-OUT', site: 'Philippine Arena' },
    ],
  },
};

export const COMPANY_LIST: Company[] = [COMPANIES.yokohama, COMPANIES['24c']];

export function isCompanyId(v: unknown): v is CompanyId {
  return typeof v === 'string' && v in COMPANIES;
}

export function getCompany(id: string | null | undefined): Company | null {
  return isCompanyId(id) ? COMPANIES[id] : null;
}
