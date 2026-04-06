'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface SignaturePadProps {
  onSave: (base64: string) => void;
  onClear?: () => void;
}

export default function SignaturePad({ onSave, onClear }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing  = useRef(false);
  const lastPos    = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty]   = useState(true);
  const [saved,   setSaved]     = useState(false);

  // ── Canvas setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Retina / high-DPI support
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#E8ECF0';
    ctx.lineWidth   = 2.2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }, []);

  // ── Coordinate helpers ───────────────────────────────────────────────────────
  function getPos(canvas: HTMLCanvasElement, e: MouseEvent | { clientX: number; clientY: number }) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ('clientX' in e ? e.clientX : (e as Touch).clientX) - rect.left,
      y: ('clientY' in e ? e.clientY : (e as Touch).clientY) - rect.top,
    };
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────
  function draw(pos: { x: number; y: number }) {
    const canvas = canvasRef.current;
    if (!canvas || !isDrawing.current) return;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    if (lastPos.current) {
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
    }
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setIsEmpty(false);
    setSaved(false);
  }

  // ── Mouse events ─────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    lastPos.current = getPos(canvasRef.current!, e.nativeEvent);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    draw(getPos(canvasRef.current!, e.nativeEvent));
  };
  const onMouseUp   = () => { isDrawing.current = false; lastPos.current = null; };

  // ── Touch events ─────────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(canvasRef.current!, e.touches[0]);
  };
  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    draw(getPos(canvasRef.current!, e.touches[0]));
  };
  const onTouchEnd  = () => { isDrawing.current = false; lastPos.current = null; };

  // ── Clear ─────────────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    setSaved(false);
    onClear?.();
  }, [onClear]);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    // Composite onto a dark background so it's legible when stored
    const offscreen   = document.createElement('canvas');
    offscreen.width   = canvas.width;
    offscreen.height  = canvas.height;
    const offCtx      = offscreen.getContext('2d')!;
    offCtx.fillStyle  = '#12151A';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    offCtx.drawImage(canvas, 0, 0);
    const base64 = offscreen.toDataURL('image/png');
    onSave(base64);
    setSaved(true);
  }, [isEmpty, onSave]);

  return (
    <div className="space-y-2">
      {/* Canvas */}
      <div className="relative rounded border border-bg-border overflow-hidden bg-bg-elevated">
        {isEmpty && (
          <span className="absolute inset-0 flex items-center justify-center
                           text-ink-muted text-sm font-body pointer-events-none select-none">
            Sign here with your finger or mouse
          </span>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-32 touch-none cursor-crosshair"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="wms-btn-secondary text-xs px-3 py-1.5"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isEmpty}
          className="wms-btn-primary text-xs px-3 py-1.5 flex-1"
        >
          {saved ? '✓ Signature Saved' : 'Confirm Signature'}
        </button>
      </div>

      {saved && (
        <p className="text-xs text-status-good flex items-center gap-1.5">
          <span>✓</span> Signature captured and attached to this entry
        </p>
      )}
    </div>
  );
}
