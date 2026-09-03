'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Icon } from '@/components/ui';

export default function SignInPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-5">
      <div className="card w-full max-w-sm p-8 text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-lg bg-ink text-white flex items-center justify-center"><Icon name="warehouse" size={24} /></div>
        <div>
          <h1 className="text-xl font-bold">EMHCO Warehousing</h1>
          <p className="text-sm text-ink-3 mt-1">Sign in with your Google account to sign off entries under your name.</p>
        </div>
        <button onClick={() => signIn('google', { callbackUrl: '/' })} className="btn-primary w-full">Sign in with Google</button>
        <Link href="/" className="block text-sm text-ink-3 hover:text-ink">Continue with PIN sign-off instead</Link>
      </div>
    </div>
  );
}
