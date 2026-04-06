'use client';

import { useState, useEffect, useRef } from 'react';
import SignaturePad from './SignaturePad';
import { enqueue } from '@/lib/offline-queue';
import type { TransactionInput, ItemMaster, TxnType } from '@/lib/types';

interface LogEntryFormProps {
  userEmail?: string;
  userName?:  string;
  isAdmin?:   boolean;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error' | 'queued';
type SignoffMode = 'google' | 'pin';

const COMMON_UNITS = ['pcs', 'boxes', 'kg', 'g', 'L', 'mL', 'bags', 'pallets', 'rolls', 'sets', 'pairs', 'cartons'];

export default function LogEntryForm({ userEmail, userName, isAdmin }: LogEntryFormProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [items,         setItems]         = useState<ItemMaster[]>([]);
  const [itemSearch,    setItemSearch]     = useState('');
  const [showDropdown,  setShowDropdown]   = useState(false);
  const [txnType,       setTxnType]        = useState<TxnType>('IN');
  const [quantity,      setQuantity]       = useState('');
  const [unit,          setUnit]           = useState('');
  const [customUnit,    setCustomUnit]     = useState('');
  const [lateEntry,     setLateEntry]      = useState(false);
  const [actualDate,    setActualDate]     = useState(() => toDateTimeLocal(new Date()));
  const [lateReason,    setLateReason]     = useState('');
  const [signoffMode,   setSignoffMode]    = useState<SignoffMode>(userName ? 'google' : 'pin');
  const [pinInput,      setPinInput]       = useState('');
  const [pinName,       setPinName]        = useState('');
  const [pinEmail,      setPinEmail]       = useState('');
  const [pinError,      setPinError]       = useState('');
  const [pinLoading,    setPinLoading]     = useState(false);
  const [signature,     setSignature]      = useState('');
  const [notes,         setNotes]          = useState('');
  const [submitState,   setSubmitState]    = useState<SubmitState>('idle');
  const [errorMsg,      setErrorMsg]       = useState('');
  const [lastTxnId,     setLastTxnId]      = useState('');

  const dropdownRef   = useRef<HTMLDivElement>(null);
  const formRef       = useRef<HTMLFormElement>(null);

  // ── Load items ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/items')
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => {}); // non-blocking
  }, []);

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Item selection ─────────────────────────────────────────────────────────
  const filteredItems = items.filter((i) =>
    i.itemName.toLowerCase().includes(itemSearch.toLowerCase())
  );

  function selectItem(item: ItemMaster) {
    setItemSearch(item.itemName);
    setUnit(item.defaultUnit);
    setCustomUnit('');
    setShowDropdown(false);
  }

  // ── PIN lookup ─────────────────────────────────────────────────────────────
  async function lookupPin() {
    if (pinInput.length < 4) return;
    setPinLoading(true);
    setPinError('');
    try {
      const res = await fetch('/api/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setPinName(data.name);
        setPinEmail(data.email);
        setPinError('');
      } else {
        setPinName('');
        setPinEmail('');
        setPinError('PIN not recognised. Try again.');
      }
    } catch {
      setPinError('Could not verify PIN. Check connection.');
    } finally {
      setPinLoading(false);
    }
  }

  // ── Derived signoff values ─────────────────────────────────────────────────
  const effectiveName  = signoffMode === 'google' ? (userName || '')  : pinName;
  const effectiveEmail = signoffMode === 'google' ? (userEmail || '') : pinEmail;

  // ── Reset form ─────────────────────────────────────────────────────────────
  function resetForm() {
    setItemSearch('');
    setQuantity('');
    setUnit('');
    setCustomUnit('');
    setLateEntry(false);
    setActualDate(toDateTimeLocal(new Date()));
    setLateReason('');
    setPinInput('');
    setPinName('');
    setPinEmail('');
    setPinError('');
    setSignature('');
    setNotes('');
    setSubmitState('idle');
    setErrorMsg('');
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitState('submitting');
    setErrorMsg('');

    const effectiveUnit = unit === '__custom__' ? customUnit : unit;

    // Client-side validation
    const errs: string[] = [];
    if (!itemSearch.trim())      errs.push('Item name is required');
    if (!quantity || +quantity <= 0) errs.push('Quantity must be greater than 0');
    if (!effectiveUnit.trim())   errs.push('Unit of measure is required');
    if (!effectiveName.trim())   errs.push('Signoff name is required');
    if (lateEntry && !lateReason.trim()) errs.push('Please explain why this is a late entry');
    if (errs.length > 0) {
      setSubmitState('error');
      setErrorMsg(errs.join(' · '));
      return;
    }

    const payload: TransactionInput = {
      itemName:        itemSearch.trim(),
      quantity:        parseFloat(quantity),
      unit:            effectiveUnit.trim(),
      type:            txnType,
      actualDateTime:  lateEntry ? new Date(actualDate).toISOString() : new Date().toISOString(),
      isLateEntry:     lateEntry,
      lateEntryReason: lateReason,
      signoffName:     effectiveName,
      signoffEmail:    effectiveEmail,
      signature,
      notes,
      entryType:       isAdmin ? 'ADMIN' : 'NORMAL',
    };

    // Try to send; fall back to offline queue
    if (!navigator.onLine) {
      enqueue(payload);
      setSubmitState('queued');
      return;
    }

    try {
      const res = await fetch('/api/transactions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setLastTxnId(data.txnId);
        setSubmitState('success');
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err: any) {
      // Network error mid-request — queue it
      if (!navigator.onLine || err.name === 'TypeError') {
        enqueue(payload);
        setSubmitState('queued');
      } else {
        setSubmitState('error');
        setErrorMsg(err.message || 'Submission failed. Please try again.');
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESS / QUEUED screens
  // ─────────────────────────────────────────────────────────────────────────
  if (submitState === 'success') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-status-goodBg border border-status-good/30
                        flex items-center justify-center text-3xl">
          ✓
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-status-good">Entry logged</p>
          <p className="text-ink-secondary text-sm font-mono">{lastTxnId}</p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-4 text-sm space-y-1 w-full max-w-sm font-mono">
          <div className="flex justify-between">
            <span className="text-ink-secondary">Item</span>
            <span>{itemSearch}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-secondary">Qty</span>
            <span className={txnType === 'IN' ? 'text-txn-in' : 'text-txn-out'}>
              {txnType === 'IN' ? '+' : '−'}{quantity} {unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-secondary">Signoff</span>
            <span>{effectiveName}</span>
          </div>
        </div>
        <button onClick={resetForm} className="wms-btn-primary w-full max-w-sm">
          Log another entry
        </button>
      </div>
    );
  }

  if (submitState === 'queued') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-status-lowBg border border-status-low/30
                        flex items-center justify-center text-3xl">
          ⏳
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-status-low">Saved locally</p>
          <p className="text-ink-secondary text-sm">
            No connection detected. Your entry has been saved on this device
            and will sync automatically when connected.
          </p>
        </div>
        <button onClick={resetForm} className="wms-btn-primary w-full max-w-sm">
          Log another entry
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN FORM
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6 pb-20 animate-slide-up">

      {/* ── IN / OUT Toggle ──────────────────────────────────────────────── */}
      <div>
        <label className="wms-label">Transaction Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['IN', 'OUT'] as TxnType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTxnType(t)}
              className={`
                py-4 rounded-lg border-2 font-display font-bold text-xl
                transition-all duration-150
                ${txnType === t && t === 'IN'
                  ? 'bg-txn-inBg border-txn-in text-txn-in shadow-glow-green'
                  : txnType === t && t === 'OUT'
                  ? 'bg-txn-outBg border-txn-out text-txn-out shadow-glow-red'
                  : 'bg-bg-elevated border-bg-border text-ink-secondary hover:border-bg-hover'}
              `}
            >
              {t === 'IN' ? '↓ IN' : '↑ OUT'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Item Name ────────────────────────────────────────────────────── */}
      <div className="relative" ref={dropdownRef}>
        <label className="wms-label" htmlFor="item-search">Item Name</label>
        <input
          id="item-search"
          type="text"
          className="wms-input"
          placeholder="Search or type item name…"
          value={itemSearch}
          onChange={(e) => { setItemSearch(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          autoComplete="off"
        />
        {showDropdown && itemSearch && (
          <div className="absolute z-30 w-full mt-1 bg-bg-elevated border border-bg-border
                          rounded-lg shadow-panel overflow-hidden max-h-52 overflow-y-auto">
            {filteredItems.length > 0
              ? filteredItems.map((item) => (
                  <button
                    key={item.itemId}
                    type="button"
                    onClick={() => selectItem(item)}
                    className="w-full text-left px-3 py-2.5 hover:bg-bg-hover
                               flex items-center justify-between text-sm"
                  >
                    <span className="font-medium">{item.itemName}</span>
                    <span className="text-ink-muted font-mono text-xs">
                      {item.defaultUnit} · {item.category}
                      {item.isAdminAdded && <span className="ml-1 text-amber-400">★</span>}
                    </span>
                  </button>
                ))
              : (
                <div className="px-3 py-2.5 text-ink-secondary text-sm">
                  No match — you can still type a new item name
                </div>
              )}
          </div>
        )}
      </div>

      {/* ── Quantity + Unit ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="wms-label" htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="any"
            className="wms-input font-mono text-lg"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div>
          <label className="wms-label" htmlFor="unit">Unit</label>
          <select
            id="unit"
            className="wms-input"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="">Select unit…</option>
            {COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            <option value="__custom__">Other (type below)</option>
          </select>
          {unit === '__custom__' && (
            <input
              type="text"
              className="wms-input mt-2"
              placeholder="e.g. drums, sacks…"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* ── Date / Late Entry ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="wms-label mb-0">Date & Time</label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-amber-500 w-4 h-4"
              checked={lateEntry}
              onChange={(e) => {
                setLateEntry(e.target.checked);
                if (!e.target.checked) setLateReason('');
              }}
            />
            <span className="text-xs text-ink-secondary">This happened earlier (late entry)</span>
          </label>
        </div>

        {lateEntry ? (
          <div className="space-y-3 p-3 bg-status-lowBg border border-status-low/25 rounded-lg">
            <p className="text-xs text-status-low flex items-start gap-1.5">
              <span>⚠</span>
              <span>
                Set the <strong>actual</strong> date/time the event happened below.
                The system will automatically record when this entry was logged.
              </span>
            </p>
            <div>
              <label className="wms-label" htmlFor="actual-date">Actual Event Date & Time</label>
              <input
                id="actual-date"
                type="datetime-local"
                className="wms-input font-mono"
                value={actualDate}
                onChange={(e) => setActualDate(e.target.value)}
                max={toDateTimeLocal(new Date())}
              />
            </div>
            <div>
              <label className="wms-label" htmlFor="late-reason">
                Reason for Late Entry <span className="text-status-critical">*</span>
              </label>
              <textarea
                id="late-reason"
                className="wms-input resize-none"
                rows={2}
                placeholder="e.g. Item received after shift, logged next day on return…"
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="wms-input font-mono text-ink-secondary text-sm bg-bg-base cursor-default select-none">
            Auto-stamped: {new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>

      {/* ── Signoff ───────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="wms-label mb-0">Signoff</label>
          {/* Toggle between Google account and PIN */}
          <div className="flex rounded border border-bg-border overflow-hidden text-xs">
            {['google', 'pin'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSignoffMode(mode as SignoffMode)}
                className={`px-2.5 py-1 transition-colors
                  ${signoffMode === mode
                    ? 'bg-amber-500 text-bg-base font-semibold'
                    : 'bg-bg-elevated text-ink-secondary hover:bg-bg-hover'}`}
              >
                {mode === 'google' ? '🔗 Account' : '🔢 PIN'}
              </button>
            ))}
          </div>
        </div>

        {signoffMode === 'google' ? (
          userName
            ? (
              <div className="wms-input bg-bg-base flex items-center gap-2 cursor-default">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30
                                 flex items-center justify-center text-xs text-amber-400 font-bold">
                  {userName.charAt(0).toUpperCase()}
                </span>
                <span className="text-ink-primary font-medium">{userName}</span>
                <span className="text-ink-muted text-xs ml-auto">{userEmail}</span>
              </div>
            )
            : (
              <div className="p-3 bg-bg-elevated border border-bg-border rounded text-sm text-ink-secondary text-center">
                Not signed in with Google.{' '}
                <a href="/api/auth/signin" className="text-amber-400 underline">Sign in</a>
                {' '}or switch to PIN mode.
              </div>
            )
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                className="wms-input font-mono tracking-widest text-center text-lg w-32"
                placeholder="••••"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value.replace(/\D/g, ''));
                  setPinName('');
                  setPinEmail('');
                  setPinError('');
                }}
                onBlur={lookupPin}
              />
              <button
                type="button"
                onClick={lookupPin}
                disabled={pinInput.length < 4 || pinLoading}
                className="wms-btn-secondary flex-1"
              >
                {pinLoading ? 'Checking…' : 'Verify PIN'}
              </button>
            </div>
            {pinError && (
              <p className="text-xs text-status-critical">{pinError}</p>
            )}
            {pinName && (
              <div className="flex items-center gap-2 p-2 bg-status-goodBg
                              border border-status-good/25 rounded text-sm">
                <span className="text-status-good">✓</span>
                <span className="font-medium">{pinName}</span>
                {pinEmail && <span className="text-ink-muted text-xs">{pinEmail}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Signature ─────────────────────────────────────────────────────── */}
      <div>
        <label className="wms-label">Signature <span className="text-ink-muted font-normal normal-case">(optional)</span></label>
        <SignaturePad
          onSave={(b64) => setSignature(b64)}
          onClear={() => setSignature('')}
        />
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <div>
        <label className="wms-label" htmlFor="notes">
          Notes <span className="text-ink-muted font-normal normal-case">(optional)</span>
        </label>
        <textarea
          id="notes"
          className="wms-input resize-none"
          rows={2}
          placeholder="Batch number, supplier, condition of goods…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {submitState === 'error' && (
        <div className="p-3 bg-status-critBg border border-status-critical/30 rounded text-sm text-status-critical">
          {errorMsg}
        </div>
      )}

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={submitState === 'submitting'}
        className={`
          w-full py-4 rounded-lg font-display font-bold text-lg
          transition-all duration-150
          ${txnType === 'IN'
            ? 'bg-txn-in text-bg-base hover:bg-green-400 active:bg-green-600'
            : 'bg-txn-out text-white hover:bg-red-400 active:bg-red-700'}
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {submitState === 'submitting'
          ? 'Saving…'
          : `Log ${txnType} — ${quantity || '0'} ${(unit === '__custom__' ? customUnit : unit) || 'units'}`}
      </button>

    </form>
  );
}

// ── Util ───────────────────────────────────────────────────────────────────────
function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
