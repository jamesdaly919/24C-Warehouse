'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui';

interface Props { onSave: (dataUrl: string) => void; onClear?: () => void; }

/**
 * Finger / mouse signature. Exports a compact PNG (max 480×160 CSS px) so it
 * fits comfortably in a Google Sheets cell.
 */
export default function SignaturePad({ onSave, onClear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }, []);

  const pos = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (p: { x: number; y: number }) => { drawing.current = true; last.current = p; };
  const move = (p: { x: number; y: number }) => {
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.beginPath(); if (last.current) ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; setEmpty(false); setSaved(false);
  };
  const end = () => { drawing.current = false; last.current = null; };

  const clear = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true); setSaved(false); onClear?.();
  }, [onClear]);

  const save = useCallback(() => {
    const c = canvasRef.current; if (!c || empty) return;
    const off = document.createElement('canvas');
    const W = 480, H = 160;
    off.width = W; off.height = H;
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(c, 0, 0, W, H);
    onSave(off.toDataURL('image/png'));
    setSaved(true);
  }, [empty, onSave]);

  return (
    <div className="space-y-2">
      <div className="relative rounded border border-line bg-white overflow-hidden">
        {empty && <span className="absolute inset-0 flex items-center justify-center text-ink-4 text-sm pointer-events-none select-none">Sign here with your finger or mouse</span>}
        <div className="absolute left-4 right-4 bottom-8 border-b border-dashed border-line pointer-events-none" />
        <canvas ref={canvasRef} className="w-full h-36 touch-none cursor-crosshair block"
                onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start(pos(e)); }}
                onPointerMove={(e) => move(pos(e))}
                onPointerUp={end} onPointerLeave={end} onPointerCancel={end} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={clear} className="btn-secondary btn-sm">Clear</button>
        <button type="button" onClick={save} disabled={empty} className={`btn-sm flex-1 ${saved ? 'btn-secondary text-good' : 'btn-primary'}`}>
          <Icon name="check" size={15} /> {saved ? 'Signature attached' : 'Confirm signature'}
        </button>
      </div>
    </div>
  );
}
