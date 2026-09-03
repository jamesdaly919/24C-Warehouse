'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { COMPANY_LIST, type CompanyId } from '@/lib/companies';
import { readPref } from '@/lib/api-client';
import { Icon } from '@/components/ui';

export default function LandingPage() {
  const [last, setLast] = useState<CompanyId | null>(null);
  useEffect(() => { setLast(readPref<CompanyId | null>('wh_last_company', null)); }, []);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink text-white flex items-center justify-center">
            <Icon name="warehouse" size={20} />
          </div>
          <div className="leading-tight">
            <div className="font-bold tracking-tight">EMHCO</div>
            <div className="text-xs text-ink-3 font-medium">Warehousing</div>
          </div>
        </div>
        <span className="hidden sm:inline text-xs text-ink-3">Group of companies · Inventory IN / OUT</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 pb-16">
        <div className="text-center mb-8 animate-slide-up">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Select a business</h1>
          <p className="text-ink-3 mt-1.5 text-sm sm:text-base">Each business has its own warehouses, stock and sign-off registry.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl animate-slide-up">
          {COMPANY_LIST.map((c) => (
            <Link
              key={c.id}
              href={`/${c.id}`}
              style={{ ['--brand' as any]: c.brand, ['--brand-dark' as any]: c.brandDark, ['--brand-soft' as any]: c.brandSoft, ['--on-brand' as any]: c.onBrand }}
              className="group card overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition-all focus-visible:ring-2 focus-visible:ring-brand"
            >
              {/* Brand panel */}
              <div className="h-36 flex items-center justify-center px-8 bg-canvas border-b border-line relative">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: c.brand }} />
                <Image
                  src={c.logo} alt={c.name} width={520} height={160}
                  className="max-h-20 w-auto object-contain"
                  priority
                />
              </div>
              {/* Meta */}
              <div className="p-5 flex items-center gap-4">
                <Image src={c.holdingLogo} alt={c.holding} width={96} height={96}
                       className="w-14 h-14 rounded-md object-contain p-1 border border-line bg-white shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-lg leading-tight flex items-center gap-2">
                    {c.name}
                    {last === c.id && <span className="badge-neutral">Last used</span>}
                  </div>
                  <div className="text-sm text-ink-2 truncate">{c.holding}</div>
                  <div className="text-xs text-ink-3 mt-0.5">{c.tagline}</div>
                </div>
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-brand bg-brand-soft group-hover:bg-brand group-hover:text-brand-on transition-colors">
                  <Icon name="chevron-right" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-xs text-ink-4 text-center max-w-md">
          Works on phone, tablet and desktop. Entries made offline are kept on the device and synced when you reconnect.
        </p>
      </main>
    </div>
  );
}
