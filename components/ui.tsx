'use client';

import type { ReactNode } from 'react';

// ─── Icons (simple stroked glyphs, 24×24 viewBox) ─────────────────────────────

export type IconName =
  | 'in' | 'out' | 'transfer' | 'box' | 'chart' | 'pin' | 'user' | 'check' | 'x'
  | 'refresh' | 'chevron-down' | 'chevron-right' | 'search' | 'plus' | 'warehouse'
  | 'storage' | 'settings' | 'alert' | 'clock' | 'pen' | 'back' | 'lock' | 'cloud-off' | 'grid';

const PATHS: Record<IconName, string> = {
  'in':            'M12 4v12m0 0-4-4m4 4 4-4M4 20h16',
  'out':           'M12 20V8m0 0-4 4m4-4 4 4M4 4h16',
  'transfer':      'M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3',
  'box':           'M3 8l9-4 9 4-9 4-9-4Zm0 0v8l9 4 9-4V8M12 12v8',
  'chart':         'M4 20V10m6 10V4m6 16v-7m4 7H2',
  'pin':           'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  'user':          'M20 21a8 8 0 1 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  'check':         'm5 12 5 5L20 7',
  'x':             'M6 6l12 12M18 6 6 18',
  'refresh':       'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  'chevron-down':  'm6 9 6 6 6-6',
  'chevron-right': 'm9 6 6 6-6 6',
  'search':        'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4',
  'plus':          'M12 5v14M5 12h14',
  'warehouse':     'M3 21V9l9-5 9 5v12M3 21h18M8 21v-8h8v8',
  'storage':       'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  'settings':      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1L14.8 3H9.2l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.5 2.4-1c.5.4 1.1.8 1.7 1l.4 2.5h5.6l.4-2.5c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z',
  'alert':         'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  'clock':         'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  'pen':           'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  'back':          'M19 12H5m0 0 7 7m-7-7 7-7',
  'lock':          'M6 11h12v10H6zM8 11V7a4 4 0 1 1 8 0v4',
  'cloud-off':     'M3 3l18 18M8 18h9a4 4 0 0 0 .9-7.9A6 6 0 0 0 7.4 8M5.5 10A4.5 4.5 0 0 0 8 18',
  'grid':          'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};

export function Icon({ name, size = 18, className = '', strokeWidth = 2 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
         className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// ─── Small building blocks ────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: 'GOOD' | 'LOW' | 'CRITICAL' | 'EMPTY' }) {
  const cls = { GOOD: 'badge-good', LOW: 'badge-low', CRITICAL: 'badge-critical', EMPTY: 'badge-empty' }[status];
  const label = { GOOD: 'Good', LOW: 'Low', CRITICAL: 'Critical', EMPTY: 'Empty' }[status];
  return <span className={cls}><span className="w-1.5 h-1.5 rounded-full bg-current" />{label}</span>;
}

export function Stat({ label, value, tone = 'ink', active, onClick }: {
  label: string; value: ReactNode; tone?: 'ink' | 'good' | 'low' | 'critical' | 'empty' | 'brand'; active?: boolean; onClick?: () => void;
}) {
  const color = {
    ink: 'text-ink', good: 'text-good', low: 'text-low', critical: 'text-critical', empty: 'text-empty', brand: 'text-brand',
  }[tone];
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
         className={`card px-3.5 py-3 text-left transition-all ${onClick ? 'hover:shadow-lift' : ''} ${active ? 'ring-2 ring-brand border-brand' : ''}`}>
      <div className={`text-2xl font-bold tnum leading-tight ${color}`}>{value}</div>
      <div className="text-xs text-ink-3 mt-0.5 font-medium">{label}</div>
    </Tag>
  );
}

export function Empty({ icon = 'box', title, hint }: { icon?: IconName; title: string; hint?: string }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto w-11 h-11 rounded-full bg-canvas border border-line flex items-center justify-center text-ink-4 mb-3">
        <Icon name={icon} size={20} />
      </div>
      <p className="font-semibold text-ink-2">{title}</p>
      {hint && <p className="hint mt-1 max-w-sm mx-auto">{hint}</p>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ${className}`} />;
}

export function Alert({ tone, children }: { tone: 'error' | 'warn' | 'ok' | 'info'; children: ReactNode }) {
  const cls = {
    error: 'bg-critical-bg border-critical-line text-critical',
    warn:  'bg-low-bg border-low-line text-low',
    ok:    'bg-good-bg border-good-line text-good',
    info:  'bg-move-trfBg border-indigo-200 text-move-trf',
  }[tone];
  return <div className={`px-3.5 py-3 rounded border text-sm ${cls}`}>{children}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] animate-fade-in"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-surface w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh] overflow-y-auto rounded-t-xl sm:rounded-xl shadow-modal animate-pop pb-safe`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface z-10">
          <h2 className="font-bold text-base">{title}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm -mr-2" aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
