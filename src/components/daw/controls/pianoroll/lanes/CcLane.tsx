// src/components/daw/controls/pianoroll/lanes/CcLane.tsx

"use client";

import { memo, useCallback, useEffect, useRef } from "react";

export type CcLaneProps = {
  keyWidth: number;
  pxPerBeat: number;
  scrollX: number;
  lengthBeats: number;
  grid: 4 | 8 | 12 | 16 | 24 | 32;
  cc: number; // CC number 0-127
  active?: boolean;
  onChange?: (points: Array<{ time: number; value: number }>) => void;
};

// Minimal scaffold, not wired by default.
export const CcLane = memo(function CcLane({ keyWidth, pxPerBeat, scrollX, lengthBeats, grid }: CcLaneProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const timeToX = useCallback((beat: number) => beat * pxPerBeat - scrollX, [pxPerBeat, scrollX]);

  const draw = useCallback(() => {
    const cvs = canvasRef.current; const ctx = ctxRef.current; if (!cvs || !ctx) return;
    const W = cvs.width; const H = cvs.height; const wCss = W / dpr; const hCss = H / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr, dpr);
    // background
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, wCss, hCss);
    // left gutter
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, keyWidth, hCss);
    ctx.strokeStyle = "#2a2a2a";
    ctx.beginPath(); ctx.moveTo(keyWidth + 0.5, 0); ctx.lineTo(keyWidth + 0.5, hCss); ctx.stroke();
    // grid verticals
    ctx.save(); ctx.translate(keyWidth, 0);
    const step = 1 / grid; const maxBeat = lengthBeats;
    for (let b = 0; b <= maxBeat + 1e-6; b += step) {
      const x = Math.floor(timeToX(b)) + 0.5;
      ctx.strokeStyle = (Math.round(b) === b) ? "#3a3a3a" : "#262626";
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hCss); ctx.stroke();
    }
    ctx.restore();

    // NOTE: points rendering & interactions intentionally omitted in scaffold
    // to avoid introducing incomplete logic. This lane is disabled by default.
  }, [dpr, grid, keyWidth, lengthBeats, timeToX]);

  useEffect(() => {
    const cvs = canvasRef.current; const wrap = wrapRef.current; if (!cvs || !wrap) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return; ctxRef.current = ctx;

    const size = () => {
      const r = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(40, Math.floor(r.height || 64));
      cvs.width = Math.floor(w * dpr); cvs.height = Math.floor(h * dpr);
      cvs.style.width = `${w}px`; cvs.style.height = `${h}px`;
      draw();
    };
    size();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(size); ro.observe(wrap); }
    return () => ro?.disconnect();
  }, [dpr, draw]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div ref={wrapRef} className="h-16 w-full overflow-hidden rounded-sm border border-neutral-700 bg-neutral-900 opacity-60">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
});
