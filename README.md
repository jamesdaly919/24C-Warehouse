# EMHCO Warehousing

Responsive warehouse IN / OUT / TRANSFER logging with sign-offs, live stock and trends —
one app for every EMHCO business, one Google Sheet per business.

**Stack:** Next.js 16 · Vercel · Google Sheets API (service account) · NextAuth (optional Google sign-in)

| Business | Holding | Sheet |
|---|---|---|
| 24 Chicken (`/24c`) | House of Martin Food Inc. | `24C Warehouse Backend` |
| Yokohama (`/yokohama`) | Dynatek Alignment Specialist | `Yokohama Warehouse Backend` |

Both sheets live in Drive → **Warehouse APP**. Add a business in `lib/companies.ts` + one env var.

---

## How it works

```
/                     → business picker (brand cards)
/24c, /yokohama       → the app: Log entry · Current stock · Trends
/api/*?company=24c    → every API call is scoped to a company → its spreadsheet
```

**Locations.** Each business has warehouses and storage areas (`Locations` tab).
A STORAGE area hangs off a WAREHOUSE (e.g. *Philippine Arena — Indoor Storage* → *Outdoor Warehouse*).
A new store gets its own WAREHOUSE. Add either from **Admin → Locations** or directly in the sheet.

**Movements.** `IN` (receipt), `OUT` (issue/usage), `TRANSFER` (writes an OUT at the source and a
linked IN at the destination — company-wide stock is unchanged). Stock is computed per location and
rolled up; transfers are excluded from company-wide usage / refill statistics.

**Sign-off.** PIN (per-company registry in the `Config` tab) or Google account. Optional drawn
signature is stored as a PNG in the `Signatures` tab.

**Offline.** Entries made without a connection are queued on the device and synced automatically.

---

## Setup

### 1. Service account (once)
Google Cloud → APIs & Services → enable **Google Sheets API** → Credentials → Service Account → Keys → JSON.
Encode it: `base64 -i key.json | tr -d '\n'` (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("key.json"))`).

**Share every company sheet with the service-account email (Editor).**

### 2. Environment
Copy `.env.example` → `.env.local` (locally) or add the same keys in Vercel → Project → Settings → Environment Variables.

| Var | Purpose |
|---|---|
| `SPREADSHEET_ID_24C` / `SPREADSHEET_ID_YOKOHAMA` | one per business |
| `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` | service account key |
| `ADMIN_PASSPHRASE` | unlocks the Admin panel (items, locations, setup) |
| `ADMIN_EMAILS` | signed-in Google users treated as admins |
| `APP_TIMEZONE`, `APP_TZ_OFFSET` | timestamps written to the sheets (`Asia/Manila`, `+08:00`) |
| `GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | optional Google sign-in |

### 3. Initialise the sheets
Deploy (or `npm run dev`), open a business, click the ⚙ **Admin** icon → enter the passphrase →
**Sheet setup → Run setup**. Or from a terminal:

```bash
curl -X POST "https://<your-app>/api/setup?company=all" -H "x-admin-passphrase: <ADMIN_PASSPHRASE>"
```

Setup is idempotent: it creates missing tabs, rewrites header rows, applies formatting, seeds the
starting locations and a PIN registry — and never touches existing rows or PINs.

### 4. Staff PINs
In each sheet's **Config** tab, under the `PINS` row: `PIN | Name | Email | Role (STAFF/ADMIN)`.

---

## Sheet reference

**Transaction Log** — A Transaction ID · B Item · C Qty · D Unit · E Type (IN/OUT) · F Actual date/time ·
G Logged date/time · H Late? · I Late reason · J Signoff name · K Signoff email · L Signature note ·
M Notes · N Entry type · **O Location ID · P Location name · Q Movement (RECEIPT / ISSUE / TRANSFER_OUT / TRANSFER_IN) · R Counterpart location · S Transfer ref**

**Current Stock** — rebuilt after every entry; `ALL` rows first (rolled up), then one block per location.

**Item Master** — thresholds, lead time, reorder point (blank = computed automatically).

**Locations** — `Location ID · Name · Type · Parent Location ID · Site · Active · Notes`.

**Signatures** — `Transaction ID · Signoff name · Logged at · PNG data URL`.

Timestamps are written as `yyyy-MM-dd HH:mm` in Asia/Manila.

---

## Development

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev                  # http://localhost:3000
npx tsx scripts/logic-test.ts   # stock / transfer / trend logic checks
```

## Project structure

```
app/
  page.tsx                 business picker
  [company]/page.tsx       app shell for one business
  api/{transactions,stock,trends,items,locations,pins,setup}/route.ts
components/
  CompanyApp.tsx           header, tabs, location context
  LocationPicker.tsx       hierarchical warehouse / storage picker
  LogEntryForm.tsx         IN / OUT / TRANSFER form with PIN sign-off + signature
  CurrentStock.tsx         stock table with per-location breakdown
  TrendsTab.tsx            usage frequency, lead times, reorder alerts
  AdminPanel.tsx           items · locations · sheet setup
  SignaturePad.tsx, OfflineBanner.tsx, ui.tsx
lib/
  companies.ts             business registry (brand, sheet env var, seed locations)
  sheets.ts                Google Sheets I/O + stock computation
  trends.ts                trend computation
  request.ts, api-client.ts, offline-queue.ts, types.ts, auth.ts
```
