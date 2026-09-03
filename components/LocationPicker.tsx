'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp, ALL } from '@/components/CompanyApp';
import { Icon } from '@/components/ui';
import type { Location } from '@/lib/types';

/** Hierarchical warehouse / storage picker in the header. */
export default function LocationPicker() {
  const { locations, locationsLoading, locationId, setLocationId, openAdmin } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const current = locations.find((l) => l.id === locationId);
  const label = locationId === ALL ? 'All locations' : current?.name ?? 'Choose location';
  const depthOf = (l: Location) => {
    let d = 0, p = l.parentId;
    while (p) { const parent = locations.find((x) => x.id === p); if (!parent) break; d++; p = parent.parentId; }
    return d;
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
              className="btn-secondary btn-sm max-w-[46vw] sm:max-w-xs"
              aria-haspopup="listbox" aria-expanded={open}>
        <Icon name="pin" size={16} className="text-brand" />
        <span className="truncate">{locationsLoading && !locations.length ? 'Loading…' : label}</span>
        <Icon name="chevron-down" size={14} className="text-ink-3" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[92vw] card shadow-lift p-1.5 z-50 animate-pop" role="listbox">
          <Option active={locationId === ALL} onClick={() => { setLocationId(ALL); setOpen(false); }}
                  icon="grid" title="All locations" sub="Rolled-up view for stock & trends" />
          <div className="my-1 border-t border-line" />
          {locations.length === 0 && (
            <div className="px-3 py-3 text-sm text-ink-3">
              No locations yet. {' '}
              <button className="text-brand font-semibold underline" onClick={() => { setOpen(false); openAdmin(); }}>Add one in Admin</button>
              {' '}or run Setup.
            </div>
          )}
          {locations.map((l) => (
            <Option key={l.id} active={locationId === l.id} depth={depthOf(l)}
                    onClick={() => { setLocationId(l.id); setOpen(false); }}
                    icon={l.type === 'WAREHOUSE' ? 'warehouse' : 'storage'}
                    title={l.name}
                    sub={`${l.type === 'WAREHOUSE' ? 'Warehouse' : 'Storage area'}${l.site ? ` · ${l.site}` : ''}`} />
          ))}
          <div className="my-1 border-t border-line" />
          <button onClick={() => { setOpen(false); openAdmin(); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-sm text-sm text-ink-2 hover:bg-canvas">
            <Icon name="plus" size={16} /> Manage locations
          </button>
        </div>
      )}
    </div>
  );
}

function Option({ active, onClick, icon, title, sub, depth = 0 }: {
  active: boolean; onClick: () => void; icon: 'grid' | 'warehouse' | 'storage'; title: string; sub: string; depth?: number;
}) {
  return (
    <button onClick={onClick} role="option" aria-selected={active}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-left transition-colors
              ${active ? 'bg-brand-soft' : 'hover:bg-canvas'}`}
            style={{ paddingLeft: 12 + depth * 18 }}>
      {depth > 0 && <span className="w-3 border-t border-line-strong -ml-3" />}
      <span className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 ${active ? 'bg-brand text-brand-on' : 'bg-canvas text-ink-3'}`}>
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{title}</span>
        <span className="block text-xs text-ink-3 truncate">{sub}</span>
      </span>
      {active && <Icon name="check" size={16} className="text-brand" />}
    </button>
  );
}
