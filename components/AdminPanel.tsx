'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/CompanyApp';
import { Modal, Icon, Alert, Spinner } from '@/components/ui';
import { apiPost, apiUrl, readPref, writePref } from '@/lib/api-client';
import type { LocationType } from '@/lib/types';

type Tab = 'items' | 'locations' | 'setup';

/**
 * Admin panel: add items, add warehouses / storage areas, initialise the sheet.
 * Gated by the ADMIN_PASSPHRASE (checked server-side on every call).
 */
export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const { company, locations, refreshLocations } = useApp();
  const [pass, setPass] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState<Tab>('items');

  useEffect(() => {
    const saved = readPref<string>('wh_admin_pass', '');
    if (saved) { setPass(saved); verify(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(p = pass) {
    setChecking(true); setAuthErr('');
    try {
      const res = await fetch(apiUrl(company.id, '/api/setup'), { headers: { 'x-admin-passphrase': p } });
      if (res.status === 401) { setAuthErr('Incorrect passphrase'); setAuthed(false); writePref('wh_admin_pass', ''); }
      else { setAuthed(true); writePref('wh_admin_pass', p); }
    } catch { setAuthErr('Could not reach the server'); }
    finally { setChecking(false); }
  }

  const hdr = { 'x-admin-passphrase': pass };

  return (
    <Modal title={<span className="flex items-center gap-2"><Icon name="settings" size={18} className="text-brand" /> Admin · {company.name}</span>} onClose={onClose} wide>
      {!authed ? (
        <div className="space-y-3 max-w-sm">
          <p className="text-sm text-ink-2">Enter the admin passphrase to manage items, locations and setup.</p>
          <input type="password" className="input" placeholder="Admin passphrase" value={pass} autoFocus
                 onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verify()} />
          {authErr && <p className="text-xs text-critical">{authErr}</p>}
          <button onClick={() => verify()} disabled={!pass || checking} className="btn-primary w-full">{checking ? <Spinner /> : <Icon name="lock" size={16} />} Unlock</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="seg">
            <button data-active={tab === 'items'} onClick={() => setTab('items')}>Items</button>
            <button data-active={tab === 'locations'} onClick={() => setTab('locations')}>Locations</button>
            <button data-active={tab === 'setup'} onClick={() => setTab('setup')}>Sheet setup</button>
          </div>
          {tab === 'items' && <ItemsTab companyId={company.id} hdr={hdr} />}
          {tab === 'locations' && <LocationsTab companyId={company.id} hdr={hdr} locations={locations} refresh={refreshLocations} />}
          {tab === 'setup' && <SetupTab companyId={company.id} hdr={hdr} refresh={refreshLocations} />}
          <button onClick={() => { writePref('wh_admin_pass', ''); setAuthed(false); setPass(''); }} className="btn-ghost btn-sm text-ink-3 -ml-2">Lock admin on this device</button>
        </div>
      )}
    </Modal>
  );
}

// ─── Items ────────────────────────────────────────────────────────────────────

function ItemsTab({ companyId, hdr }: { companyId: any; hdr: Record<string, string> }) {
  const blank = { itemName: '', category: 'General', defaultUnit: '', lowThreshold: '', criticalThreshold: '', avgLeadTimeDays: '', reorderPoint: '' };
  const [f, setF] = useState(blank);
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setState('saving'); setMsg('');
    try {
      await apiPost(companyId, '/api/items', f, hdr);
      setState('done'); setMsg(`“${f.itemName}” added to the item master.`); setF(blank);
    } catch (e: any) { setState('error'); setMsg(e.message); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">Pre-register an item with thresholds so stock status and reorder alerts work from day one. Items logged from the form are auto-added with no thresholds.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">Item name *</label><input className="input" value={f.itemName} onChange={set('itemName')} placeholder="e.g. Cooking oil 17kg" /></div>
        <div><label className="label">Category</label><input className="input" value={f.category} onChange={set('category')} placeholder="General" /></div>
        <div><label className="label">Unit *</label><input className="input" value={f.defaultUnit} onChange={set('defaultUnit')} placeholder="pcs, kg, boxes…" /></div>
        <div><label className="label">Low threshold</label><input type="number" className="input tnum" value={f.lowThreshold} onChange={set('lowThreshold')} placeholder="e.g. 20" /></div>
        <div><label className="label">Critical threshold</label><input type="number" className="input tnum" value={f.criticalThreshold} onChange={set('criticalThreshold')} placeholder="e.g. 5" /></div>
        <div><label className="label">Refill lead time (days)</label><input type="number" className="input tnum" value={f.avgLeadTimeDays} onChange={set('avgLeadTimeDays')} placeholder="auto if blank" /></div>
        <div><label className="label">Reorder point</label><input type="number" className="input tnum" value={f.reorderPoint} onChange={set('reorderPoint')} placeholder="auto if blank" /></div>
      </div>
      {msg && <Alert tone={state === 'error' ? 'error' : 'ok'}>{msg}</Alert>}
      <button onClick={save} disabled={state === 'saving' || !f.itemName || !f.defaultUnit} className="btn-primary w-full">
        {state === 'saving' ? <Spinner /> : <Icon name="plus" size={16} />} Add item
      </button>
    </div>
  );
}

// ─── Locations ────────────────────────────────────────────────────────────────

function LocationsTab({ companyId, hdr, locations, refresh }: { companyId: any; hdr: Record<string, string>; locations: any[]; refresh: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<LocationType>('STORAGE');
  const [parentId, setParentId] = useState('');
  const [site, setSite] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function save() {
    setState('saving'); setMsg('');
    try {
      await apiPost(companyId, '/api/locations', { name, type, parentId: type === 'STORAGE' ? parentId : '', site }, hdr);
      setState('done'); setMsg(`“${name}” added.`); setName(''); setSite(''); await refresh();
    } catch (e: any) { setState('error'); setMsg(e.message); }
  }

  const warehouses = locations.filter((l) => l.type === 'WAREHOUSE');

  return (
    <div className="space-y-4">
      <div>
        <div className="label">Current locations</div>
        {locations.length === 0 ? <p className="text-sm text-ink-3">None yet — run Sheet setup or add one below.</p> : (
          <ul className="border border-line rounded divide-y divide-line text-sm">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2" style={{ paddingLeft: l.parentId ? 28 : 12 }}>
                <Icon name={l.type === 'WAREHOUSE' ? 'warehouse' : 'storage'} size={16} className="text-ink-3" />
                <span className="font-medium flex-1 truncate">{l.name}</span>
                <span className="text-xs text-ink-3 tnum">{l.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line pt-4 space-y-3">
        <div className="label">Add a location</div>
        <div className="grid grid-cols-2 gap-2">
          {(['WAREHOUSE', 'STORAGE'] as LocationType[]).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
                    className={`rounded-lg border-2 p-3 text-left transition-colors ${type === t ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm"><Icon name={t === 'WAREHOUSE' ? 'warehouse' : 'storage'} size={16} />{t === 'WAREHOUSE' ? 'New warehouse' : 'Storage area'}</div>
              <div className="text-xs text-ink-3 mt-0.5">{t === 'WAREHOUSE' ? 'A new store / site with its own main stock' : 'A sub-location inside an existing warehouse'}</div>
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="label">Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'WAREHOUSE' ? 'e.g. SM Clark — Main Warehouse' : 'e.g. Indoor Storage'} /></div>
          {type === 'STORAGE' && (
            <div>
              <label className="label">Inside warehouse *</label>
              <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Choose…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
          <div><label className="label">Site / branch</label><input className="input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. Philippine Arena" /></div>
        </div>
        {msg && <Alert tone={state === 'error' ? 'error' : 'ok'}>{msg}</Alert>}
        <button onClick={save} disabled={state === 'saving' || !name || (type === 'STORAGE' && !parentId)} className="btn-primary w-full">
          {state === 'saving' ? <Spinner /> : <Icon name="plus" size={16} />} Add {type === 'WAREHOUSE' ? 'warehouse' : 'storage area'}
        </button>
      </div>
    </div>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function SetupTab({ companyId, hdr, refresh }: { companyId: any; hdr: Record<string, string>; refresh: () => Promise<void> }) {
  const [status, setStatus] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');

  async function check() {
    setErr('');
    try {
      const r = await fetch(apiUrl(companyId, '/api/setup'), { headers: hdr });
      setStatus((await r.json())[companyId]);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { check(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function run() {
    setRunning(true); setErr(''); setResult(null);
    try {
      const d = await apiPost<any>(companyId, '/api/setup', {}, hdr);
      setResult(d.results?.[companyId]); await check(); await refresh();
    } catch (e: any) { setErr(e.message); } finally { setRunning(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">Creates any missing tabs in this company&apos;s Google Sheet, writes headers and formatting, and seeds the starting locations and PIN registry. Safe to run again — existing rows and PINs are kept.</p>
      {status && !status.error && (
        <div className="text-sm border border-line rounded p-3 space-y-1">
          <div><span className="text-ink-3">Sheet:</span> <span className="font-semibold">{status.title}</span></div>
          <div><span className="text-ink-3">Tabs:</span> {status.tabs?.join(', ')}</div>
          {status.missing?.length ? <div className="text-low">Missing: {status.missing.join(', ')}</div> : <div className="text-good flex items-center gap-1"><Icon name="check" size={14} /> All tabs present</div>}
        </div>
      )}
      {status?.error && <Alert tone="error">{status.error}. Check that the spreadsheet ID env var is set and the sheet is shared with the service account.</Alert>}
      {err && <Alert tone="error">{err}</Alert>}
      {result && !result.error && (
        <Alert tone="ok">Done. Created: {result.tabsCreated?.length ? result.tabsCreated.join(', ') : 'nothing new'}{result.seededLocations?.length ? ` · seeded ${result.seededLocations.join(', ')}` : ''}{result.seededConfig ? ' · seeded Config' : ''}.</Alert>
      )}
      {result?.error && <Alert tone="error">{result.error}</Alert>}
      <button onClick={run} disabled={running} className="btn-primary w-full">{running ? <Spinner /> : <Icon name="refresh" size={16} />} Run setup for {companyId}</button>
    </div>
  );
}
