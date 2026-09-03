'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/CompanyApp';
import SignaturePad from '@/components/SignaturePad';
import { Icon, Alert, Spinner } from '@/components/ui';
import { apiGet, apiPost, readPref, writePref } from '@/lib/api-client';
import { enqueue } from '@/lib/offline-queue';
import type { TransactionInput, ItemMaster, MovementKind } from '@/lib/types';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error' | 'queued';
type SignoffMode = 'pin' | 'account';

const COMMON_UNITS = ['pcs', 'boxes', 'kg', 'g', 'L', 'mL', 'bags', 'sacks', 'cartons', 'packs', 'rolls', 'sets', 'pairs', 'pallets', 'drums'];

const KIND_META: Record<MovementKind, { label: string; hint: string; icon: 'in' | 'out' | 'transfer'; cls: string; btn: string }> = {
  IN:       { label: 'IN',       hint: 'Received into a location',          icon: 'in',       cls: 'border-move-in text-move-in bg-move-inBg',   btn: 'bg-move-in hover:bg-green-800' },
  OUT:      { label: 'OUT',      hint: 'Issued / used from a location',      icon: 'out',      cls: 'border-move-out text-move-out bg-move-outBg', btn: 'bg-move-out hover:bg-red-800' },
  TRANSFER: { label: 'TRANSFER', hint: 'Moved between two locations',       icon: 'transfer', cls: 'border-move-trf text-move-trf bg-move-trfBg', btn: 'bg-move-trf hover:bg-indigo-800' },
};

export default function LogEntryForm({ onLogged }: { onLogged?: () => void }) {
  const { company, locations, activeLocation, user } = useApp();

  // ── State ──────────────────────────────────────────────────────────────────
  const [kind, setKind]             = useState<MovementKind>('IN');
  const [fromId, setFromId]         = useState('');
  const [toId, setToId]             = useState('');
  const [items, setItems]           = useState<ItemMaster[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [showDrop, setShowDrop]     = useState(false);
  const [quantity, setQuantity]     = useState('');
  const [unit, setUnit]             = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [late, setLate]             = useState(false);
  const [actualDate, setActualDate] = useState(() => toLocal(new Date()));
  const [lateReason, setLateReason] = useState('');
  const [signoffMode, setSignoffMode] = useState<SignoffMode>('pin');
  const [pin, setPin]               = useState('');
  const [pinName, setPinName]       = useState('');
  const [pinEmail, setPinEmail]     = useState('');
  const [pinError, setPinError]     = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [showSig, setShowSig]       = useState(false);
  const [signature, setSignature]   = useState('');
  const [notes, setNotes]           = useState('');
  const [state, setState]           = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg]     = useState('');
  const [lastId, setLastId]         = useState('');
  const [recent, setRecent]         = useState<string[]>([]);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiGet<{ items: ItemMaster[] }>(company.id, '/api/items').then((d) => setItems(d.items || [])).catch(() => {});
    setRecent(readPref<string[]>(`wh_${company.id}_recent_items`, []));
  }, [company.id]);

  useEffect(() => { if (activeLocation && !fromId) setFromId(activeLocation.id); }, [activeLocation, fromId]);
  useEffect(() => { if (user?.name) setSignoffMode('account'); }, [user?.name]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const list = q ? items.filter((i) => i.itemName.toLowerCase().includes(q)) : items;
    if (!q && recent.length) {
      const r = recent.map((n) => items.find((i) => i.itemName === n)).filter(Boolean) as ItemMaster[];
      return [...r, ...list.filter((i) => !recent.includes(i.itemName))].slice(0, 12);
    }
    return list.slice(0, 12);
  }, [items, itemSearch, recent]);

  const effectiveUnit = unit === '__custom__' ? customUnit : unit;
  const effectiveName  = signoffMode === 'account' ? (user?.name || '') : pinName;
  const effectiveEmail = signoffMode === 'account' ? (user?.email || '') : pinEmail;
  const from = locations.find((l) => l.id === fromId);
  const to   = locations.find((l) => l.id === toId);
  const meta = KIND_META[kind];

  // ── Handlers ───────────────────────────────────────────────────────────────
  function selectItem(i: ItemMaster) { setItemSearch(i.itemName); setUnit(i.defaultUnit || ''); setCustomUnit(''); setShowDrop(false); }

  async function verifyPin() {
    if (pin.length < 3) return;
    setPinLoading(true); setPinError('');
    try {
      const d = await apiPost<{ name: string; email: string }>(company.id, '/api/pins', { pin });
      setPinName(d.name); setPinEmail(d.email);
    } catch (e: any) {
      setPinName(''); setPinEmail('');
      setPinError(e.status === 401 ? 'PIN not recognised for this business.' : 'Could not verify PIN — check your connection.');
    } finally { setPinLoading(false); }
  }

  function reset(keepKind = true) {
    if (!keepKind) setKind('IN');
    setToId(''); setItemSearch(''); setQuantity(''); setUnit(''); setCustomUnit('');
    setLate(false); setActualDate(toLocal(new Date())); setLateReason('');
    setPin(''); setPinName(''); setPinEmail(''); setPinError('');
    setSignature(''); setShowSig(false); setNotes(''); setState('idle'); setErrorMsg('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    const errs: string[] = [];
    if (!from)                          errs.push('Choose a location');
    if (kind === 'TRANSFER' && !to)     errs.push('Choose a destination');
    if (kind === 'TRANSFER' && to && from && to.id === from.id) errs.push('Destination must differ from source');
    if (!itemSearch.trim())             errs.push('Item name is required');
    if (!quantity || +quantity <= 0)    errs.push('Quantity must be greater than 0');
    if (!effectiveUnit.trim())          errs.push('Unit is required');
    if (!effectiveName.trim())          errs.push(signoffMode === 'pin' ? 'Verify a PIN to sign off' : 'Sign in or switch to PIN');
    if (late && !lateReason.trim())     errs.push('Give a reason for the late entry');
    if (errs.length) { setState('error'); setErrorMsg(errs.join(' · ')); return; }

    const payload: TransactionInput = {
      company: company.id,
      locationId: from!.id,
      toLocationId: kind === 'TRANSFER' ? to!.id : undefined,
      kind,
      itemName: itemSearch.trim(),
      quantity: parseFloat(quantity),
      unit: effectiveUnit.trim(),
      actualDateTime: late ? new Date(actualDate).toISOString() : new Date().toISOString(),
      isLateEntry: late,
      lateEntryReason: lateReason.trim(),
      signoffName: effectiveName.trim(),
      signoffEmail: effectiveEmail.trim(),
      signature,
      notes: notes.trim(),
      entryType: user?.isAdmin ? 'ADMIN' : 'NORMAL',
    };

    const nextRecent = [payload.itemName, ...recent.filter((r) => r !== payload.itemName)].slice(0, 8);
    setRecent(nextRecent); writePref(`wh_${company.id}_recent_items`, nextRecent);

    if (typeof navigator !== 'undefined' && !navigator.onLine) { enqueue(payload); setState('queued'); return; }

    setState('submitting');
    try {
      const d = await apiPost<{ txnId: string }>(company.id, '/api/transactions', payload);
      setLastId(d.txnId); setState('success'); onLogged?.();
    } catch (err: any) {
      if (!err.status) { enqueue(payload); setState('queued'); }
      else { setState('error'); setErrorMsg(err.message || 'Submission failed. Please try again.'); }
    }
  }

  // ── Result screens ─────────────────────────────────────────────────────────
  if (state === 'success' || state === 'queued') {
    const ok = state === 'success';
    return (
      <div className="card p-6 sm:p-8 flex flex-col items-center gap-5 animate-pop">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${ok ? 'bg-good-bg text-good' : 'bg-low-bg text-low'}`}>
          <Icon name={ok ? 'check' : 'cloud-off'} size={30} strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold">{ok ? 'Entry logged' : 'Saved on this device'}</p>
          <p className="text-sm text-ink-3 mt-1">
            {ok ? <span className="tnum">{lastId}</span> : 'No connection. It will sync automatically when you are back online.'}
          </p>
        </div>
        <dl className="w-full max-w-sm text-sm divide-y divide-line border border-line rounded">
          <Row k="Movement"><span className={`badge ${meta.cls}`}><Icon name={meta.icon} size={12} />{meta.label}</span></Row>
          <Row k="Item">{itemSearch}</Row>
          <Row k="Quantity"><span className="tnum font-semibold">{quantity} {effectiveUnit}</span></Row>
          <Row k={kind === 'TRANSFER' ? 'Route' : 'Location'}>
            {kind === 'TRANSFER' ? `${from?.name} → ${to?.name}` : from?.name}
          </Row>
          <Row k="Signed by">{effectiveName}{signature && <span className="ml-1 text-ink-3">· signature attached</span>}</Row>
        </dl>
        <div className="flex gap-2 w-full max-w-sm">
          <button onClick={() => reset(true)} className="btn-primary flex-1">Log another {meta.label}</button>
          <button onClick={() => reset(false)} className="btn-secondary">New</button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="space-y-5 animate-slide-up">

      {/* Movement */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(KIND_META) as MovementKind[]).map((k) => {
          const m = KIND_META[k]; const active = kind === k;
          return (
            <button key={k} type="button" onClick={() => setKind(k)}
                    className={`rounded-lg border-2 py-3.5 px-2 flex flex-col items-center gap-1 transition-all
                      ${active ? m.cls + ' shadow-card' : 'border-line bg-surface text-ink-3 hover:border-line-strong'}`}>
              <Icon name={m.icon} size={22} strokeWidth={2.4} />
              <span className="font-bold text-sm tracking-wide">{m.label}</span>
              <span className={`text-[11px] leading-tight text-center ${active ? 'opacity-80' : 'text-ink-4'}`}>{m.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Location(s) */}
      <div className="card p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="from">{kind === 'IN' ? 'Into location' : kind === 'OUT' ? 'From location' : 'From'}</label>
            <select id="from" className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {locations.length === 0 && <option value="">No locations set up yet</option>}
              {locations.map((l) => <option key={l.id} value={l.id}>{l.parentId ? '↳ ' : ''}{l.name}</option>)}
            </select>
          </div>
          {kind === 'TRANSFER' && (
            <div>
              <label className="label" htmlFor="to">To</label>
              <select id="to" className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Choose destination…</option>
                {locations.filter((l) => l.id !== fromId).map((l) => <option key={l.id} value={l.id}>{l.parentId ? '↳ ' : ''}{l.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {kind === 'TRANSFER' && (
          <p className="hint flex items-start gap-1.5"><Icon name="transfer" size={14} className="mt-0.5" />
            A transfer records an OUT at the source and a matching IN at the destination. Company-wide stock is unchanged.</p>
        )}
      </div>

      {/* Item + qty */}
      <div className="card p-4 space-y-4">
        <div className="relative" ref={dropRef}>
          <label className="label" htmlFor="item">Item</label>
          <div className="relative">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input id="item" className="input pl-9" placeholder="Search or type a new item name…"
                   value={itemSearch} autoComplete="off"
                   onChange={(e) => { setItemSearch(e.target.value); setShowDrop(true); }}
                   onFocus={() => setShowDrop(true)} />
          </div>
          {showDrop && (filtered.length > 0 || itemSearch) && (
            <div className="absolute z-30 mt-1 w-full card shadow-lift overflow-hidden max-h-60 overflow-y-auto">
              {!itemSearch && recent.length > 0 && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-ink-4 uppercase tracking-wide">Recent</div>}
              {filtered.map((i) => (
                <button key={i.itemId || i.itemName} type="button" onClick={() => selectItem(i)}
                        className="w-full text-left px-3 py-2.5 hover:bg-canvas flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium truncate">{i.itemName}</span>
                  <span className="text-ink-3 text-xs shrink-0">{i.defaultUnit}{i.category ? ` · ${i.category}` : ''}</span>
                </button>
              ))}
              {itemSearch && !items.some((i) => i.itemName.toLowerCase() === itemSearch.trim().toLowerCase()) && (
                <div className="px-3 py-2.5 text-xs text-ink-3 border-t border-line flex items-center gap-1.5">
                  <Icon name="plus" size={13} /> “{itemSearch.trim()}” will be added as a new item
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="qty">Quantity</label>
            <input id="qty" type="number" inputMode="decimal" min="0.01" step="any" className="input tnum text-lg font-semibold"
                   placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="unit">Unit</label>
            <select id="unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Select…</option>
              {unit && !COMMON_UNITS.includes(unit) && unit !== '__custom__' && <option value={unit}>{unit}</option>}
              {COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              <option value="__custom__">Other…</option>
            </select>
            {unit === '__custom__' && (
              <input className="input mt-2" placeholder="Type a unit" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} />
            )}
          </div>
        </div>

        {/* Date */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="label mb-0">Date & time</span>
            <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-[var(--brand)]" checked={late}
                     onChange={(e) => { setLate(e.target.checked); if (!e.target.checked) setLateReason(''); }} />
              This happened earlier
            </label>
          </div>
          {late ? (
            <div className="space-y-3 p-3 rounded border border-low-line bg-low-bg">
              <input type="datetime-local" className="input tnum" value={actualDate} max={toLocal(new Date())}
                     onChange={(e) => setActualDate(e.target.value)} />
              <textarea className="input" rows={2} placeholder="Why is this being logged late? (required)"
                        value={lateReason} onChange={(e) => setLateReason(e.target.value)} />
            </div>
          ) : (
            <div className="input flex items-center gap-2 text-ink-3 bg-canvas cursor-default">
              <Icon name="clock" size={16} /> Now · {new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
        </div>
      </div>

      {/* Sign-off */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="label mb-0">Sign-off</span>
          <div className="seg">
            <button type="button" data-active={signoffMode === 'pin'} onClick={() => setSignoffMode('pin')}>PIN</button>
            <button type="button" data-active={signoffMode === 'account'} onClick={() => setSignoffMode('account')}>Account</button>
          </div>
        </div>

        {signoffMode === 'pin' ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input type="password" inputMode="numeric" maxLength={6} className="input tnum tracking-[.4em] text-center text-lg w-36"
                     placeholder="••••" value={pin} autoComplete="off"
                     onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinName(''); setPinEmail(''); setPinError(''); }}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); verifyPin(); } }}
                     onBlur={verifyPin} />
              <button type="button" onClick={verifyPin} disabled={pin.length < 3 || pinLoading} className="btn-secondary flex-1">
                {pinLoading ? <Spinner /> : <Icon name="lock" size={16} />} Verify PIN
              </button>
            </div>
            {pinError && <p className="text-xs text-critical">{pinError}</p>}
            {pinName && (
              <div className="flex items-center gap-2 px-3 py-2 rounded border border-good-line bg-good-bg text-sm">
                <Icon name="check" size={16} className="text-good" />
                <span className="font-semibold">{pinName}</span>
                {pinEmail && <span className="text-ink-3 text-xs truncate">{pinEmail}</span>}
              </div>
            )}
          </div>
        ) : user?.name ? (
          <div className="input flex items-center gap-2 bg-canvas cursor-default">
            <span className="w-6 h-6 rounded-full bg-brand-soft text-brand flex items-center justify-center text-xs font-bold">{user.name.charAt(0)}</span>
            <span className="font-semibold">{user.name}</span>
            <span className="text-ink-3 text-xs ml-auto truncate">{user.email}</span>
          </div>
        ) : (
          <Alert tone="info">Not signed in. <a href={`/api/auth/signin?callbackUrl=/${company.id}`} className="font-semibold underline">Sign in with Google</a> or use a PIN.</Alert>
        )}

        {/* Signature (optional) */}
        {!showSig ? (
          <button type="button" onClick={() => setShowSig(true)} className="btn-ghost btn-sm -ml-2 text-ink-2">
            <Icon name="pen" size={15} /> Add signature <span className="text-ink-4 font-normal">(optional)</span>
          </button>
        ) : (
          <div>
            <span className="label">Signature</span>
            <SignaturePad onSave={setSignature} onClear={() => setSignature('')} />
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="label" htmlFor="notes">Notes <span className="text-ink-4 font-normal">(optional)</span></label>
        <textarea id="notes" className="input" rows={2} placeholder="Batch no., supplier, DR/invoice no., condition of goods…"
                  value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {state === 'error' && <Alert tone="error">{errorMsg}</Alert>}

      <button type="submit" disabled={state === 'submitting'}
              className={`btn w-full text-white text-base py-4 rounded-lg ${meta.btn}`}>
        {state === 'submitting' ? <><Spinner /> Saving…</> : (
          <><Icon name={meta.icon} size={18} strokeWidth={2.5} />
            Log {meta.label} · {quantity || '0'} {effectiveUnit || 'units'}</>
        )}
      </button>
    </form>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right font-medium truncate">{children}</dd>
    </div>
  );
}

function toLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
