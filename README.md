# WMS — Warehouse Management System

A responsive, full-stack warehouse IN/OUT logging system backed by Google Sheets.

**Stack:** Next.js 14 · Vercel · Google Sheets API · NextAuth (Google OAuth)

---

## Prerequisites

- Node.js 18+
- A Google account
- A GitHub account
- A Vercel account (free tier is fine)

---

## Step 1 — Google Sheets Setup

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it something like **Warehouse WMS**.
3. Copy the Spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_ID/edit
   ```
4. Keep this tab open — you'll need the ID later.

---

## Step 2 — Google Cloud Project & Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one).
3. Enable the **Google Sheets API**:
   - Navigate to **APIs & Services → Library**
   - Search "Google Sheets API" → Enable
4. Create a Service Account:
   - Navigate to **APIs & Services → Credentials**
   - Click **Create Credentials → Service Account**
   - Name it `wms-sheets-writer`, click Create
   - Skip optional fields, click Done
5. Generate a key:
   - Click your new service account
   - Go to **Keys** tab → **Add Key → Create new key → JSON**
   - Download the JSON file
6. Encode the key as Base64:
   ```bash
   # macOS / Linux
   base64 -i your-key-file.json | tr -d '\n'
   
   # Windows (PowerShell)
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("your-key-file.json"))
   ```
   Save this Base64 string — it becomes `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`.
7. **Share your spreadsheet** with the service account email:
   - The email looks like: `wms-sheets-writer@your-project.iam.gserviceaccount.com`
   - Open your Google Sheet → Share → paste the email → set to **Editor**

---

## Step 3 — Google OAuth (for user sign-in)

1. Still in Google Cloud Console → **APIs & Services → Credentials**
2. Enable the **Google People API** (needed for user profile info)
3. Click **Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Add Authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/callback/google
   https://your-vercel-domain.vercel.app/api/auth/callback/google
   ```
6. Copy the **Client ID** and **Client Secret**

---

## Step 4 — Local Development

```bash
# Clone the repo
git clone https://github.com/your-org/warehouse-wms.git
cd warehouse-wms

# Install dependencies
npm install

# Copy env template
cp .env.example .env.local
```

Fill in `.env.local` with all your values from Steps 1–3, then:

```bash
# Generate a NextAuth secret
openssl rand -base64 32
# Paste the output into NEXTAUTH_SECRET in .env.local

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Step 5 — Initialise the Google Sheets Structure

Once your dev server is running, call the setup endpoint once:

```bash
curl -X POST http://localhost:3000/api/setup \
  -H "x-admin-passphrase: YOUR_ADMIN_PASSPHRASE"
```

This will:
- Create all 5 sheets (Transaction Log, Current Stock, Item Master, Config, Patterns)
- Write all column headers
- Apply formatting (frozen header row, conditional colour coding for IN/OUT and stock status)

You can safely re-run this — it won't duplicate headers.

---

## Step 6 — Add Staff PINs

In your Google Sheet, open the **Config** tab. Below the `PINS` row, add entries:

| PIN  | Name         | Email                 | Role (STAFF/ADMIN) |
|------|--------------|-----------------------|--------------------|
| 1234 | Juan dela Cruz | juan@company.com    | STAFF              |
| 9999 | Maria Santos   | maria@company.com   | ADMIN              |

PIN format: 4–6 digits. Keep this sheet access-restricted.

---

## Step 7 — Deploy to Vercel

```bash
# Push to GitHub
git add .
git commit -m "Initial WMS setup"
git push origin main
```

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. Add all environment variables from `.env.local`:
   - `GOOGLE_SPREADSHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (set to your Vercel URL, e.g. `https://wms.vercel.app`)
   - `ADMIN_EMAILS`
   - `ADMIN_PASSPHRASE`
4. Click **Deploy**
5. After deploy, run the setup endpoint on your live URL:
   ```bash
   curl -X POST https://your-app.vercel.app/api/setup \
     -H "x-admin-passphrase: YOUR_ADMIN_PASSPHRASE"
   ```

---

## Project Structure

```
warehouse-wms/
├── app/
│   ├── layout.tsx              # Root layout + fonts
│   ├── page.tsx                # Main app shell + tab navigation
│   ├── globals.css             # Design system CSS
│   └── api/
│       ├── auth/[...nextauth]/ # NextAuth Google OAuth
│       ├── transactions/       # POST — log IN/OUT entry
│       ├── stock/              # GET  — computed stock levels
│       ├── items/              # GET/POST — item master
│       ├── pins/               # POST — PIN lookup
│       └── setup/              # POST — initialise sheets (run once)
├── components/
│   ├── LogEntryForm.tsx        # Tab 1: IN/OUT form
│   ├── CurrentStock.tsx        # Tab 2: Stock table + admin
│   ├── SignaturePad.tsx        # Canvas signature component
│   └── OfflineBanner.tsx       # Connection status + sync
├── lib/
│   ├── sheets.ts               # Google Sheets API helpers
│   ├── auth.ts                 # NextAuth config
│   ├── offline-queue.ts        # localStorage fallback queue
│   └── types.ts                # Shared TypeScript types
└── .env.example                # Environment variable template
```

---

## Phase Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| 1 — Foundation | ✅ Done | Repo, Sheets structure, API routes, auth |
| 2 — Core Logging | ✅ Done | Tab 1 (Log Entry), Tab 2 (Current Stock), offline queue |
| 3 — Trends | 🔜 Next | Tab 3: frequency charts, pattern detection, lead times |
| 4 — Alerts | 🔜 Future | Low-stock notifications, deviation alerts, PDF export |

---

## Google Sheets Data Reference

### Transaction Log columns
| Col | Field | Notes |
|-----|-------|-------|
| A | Transaction ID | Auto-generated `TXN-YYYYMMDD-XXXX` |
| B | Item Name | |
| C | Quantity | |
| D | Unit | |
| E | Type (IN/OUT) | Green = IN, Red = OUT |
| F | Actual Date & Time | Real-world event time |
| G | Log Date & Time | System stamp — always when submitted |
| H | Late Entry? | YES/NO |
| I | Late Entry Reason | Required when H = YES |
| J | Signoff Name | |
| K | Signoff Email | |
| L | Signature | `[Signature captured]` or `—` |
| M | Notes | |
| N | Entry Type | `NORMAL` or `ADMIN` |

### Item Master columns
| Col | Field |
|-----|-------|
| A | Item ID |
| B | Item Name |
| C | Category |
| D | Default Unit |
| E | Low Threshold |
| F | Critical Threshold |
| G | Avg Lead Time (days) |
| H | Avg Daily Consumption |
| I | Reorder Point |
| J | Admin Added? |
| K | First Recorded Date |

---

## Troubleshooting

**"Failed to save transaction"** — Check that your service account has Editor access to the Sheet. Verify `GOOGLE_SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` are correct.

**"PIN not recognised"** — Check the Config sheet. Make sure the PIN section starts with a row where column A = `PINS` exactly (all caps).

**Google Sign-in not working** — Verify `NEXTAUTH_URL` matches your deployed domain exactly. Check OAuth redirect URIs in Google Cloud Console include your Vercel URL.

**Sheet not formatting correctly** — Re-run the `/api/setup` endpoint. It's idempotent for headers but will re-apply formatting.
