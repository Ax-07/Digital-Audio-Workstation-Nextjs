// src/components/daw/controls/pianoroll/lanes/VelocityLane.tsx

"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import type { MidiNote } from "@/lib/audio/types";

type DraftNote = MidiNote & { __id: number };

export type VelocityLaneProps = {
  draftRef: React.MutableRefObject<DraftNote[]>;
  selected: ReadonlyArray<number>;
  setSelected: (next: number[] | ((prev: number[]) => number[])) => void;
  pxPerBeat: number;
  grid: 4 | 8 | 12 | 16 | 24 | 32;
  keyWidth: number;
  scrollX: number;
  timeToX: (b: number) => number;
  onChange?: (next: MidiNote[]) => void;
  onRequestRedraw?: () => void;
};

export const VelocityLane = memo(function VelocityLane({
  draftRef,
  selected,
  setSelected,
  pxPerBeat,
  grid,
  keyWidth,
  scrollX,
  timeToX,
  onChange,
  onRequestRedraw,
}: VelocityLaneProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const pointerRef = useRef<{ index: number; initial: number; pointerId: number } | null>(null);
  const showTooltipRef = useRef<boolean>(false);

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = ctxRef.current;
    const wrap = wrapRef.current;
    if (!cvs || !ctx || !wrap) return;

    const W = cvs.width;
    const H = cvs.height;
    const wCss = W / dpr;
    const hCss = H / dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr, dpr);

    // background
    ctx.fillStyle = "#141414";
    ctx.fillRect(0, 0, wCss, hCss);

    // Left gutter (velocity ruler)
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, keyWidth, hCss);
    ctx.strokeStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.moveTo(keyWidth + 0.5, 0);
    ctx.lineTo(keyWidth + 0.5, hCss);
    ctx.stroke();
    // ticks 0 / 64 / 127
    ctx.fillStyle = "#888";
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    const ticks = [0, 64, 127] as const;
    for (const t of ticks) {
      const frac = t / 127;
      const y = Math.round(hCss - 2 - frac * (hCss - 4)) + 0.5;
      ctx.strokeStyle = "#2a2a2a";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(keyWidth, y);
      ctx.stroke();
      ctx.fillStyle = "#AFAFAF";
      ctx.fillText(String(t), 4, Math.max(10, Math.min(hCss - 2, y - 2)));
    }

    // grid verticals (beats)
    ctx.save();
    ctx.translate(keyWidth, 0);
    const beatsVisible = Math.ceil((wCss + scrollX) / pxPerBeat);
    const firstBeat = Math.floor(scrollX / pxPerBeat);
    for (let b = firstBeat; b <= beatsVisible; b++) {
      const x = timeToX(b) - keyWidth + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = b % 4 === 0 ? "#444" : "#2a2a2a";
      ctx.moveTo(x, 0);
      ctx.lineTo(x, hCss);
      ctx.stroke();
    }

    // bars per note
    const selSet = new Set(selected);
    const notes = draftRef.current;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]!;
      const x0 = timeToX(n.time) - keyWidth + 1;
      const w = 4; // small start bar only
      const vel = typeof n.velocity === "number" ? n.velocity : 0.8;
      const h = Math.max(2, (hCss - 6) * vel);
      const y = hCss - h - 2;
      ctx.fillStyle = selSet.has(i) ? "#FFD02F" : "#b59d4a";
      ctx.fillRect(x0, y, w, h);
      if (showTooltipRef.current && pointerRef.current && pointerRef.current.index === i) {
        const cx = x0 + Math.max(6, Math.min(w - 6, w * 0.5));
        const cy = y - 8;
        const val = Math.round(vel * 127);
        ctx.fillStyle = "#000";
        ctx.fillRect(cx - 12, cy - 10, 28, 14);
        ctx.strokeStyle = "#FFD02F";
        ctx.strokeRect(cx - 12 + 0.5, cy - 10 + 0.5, 28 - 1, 14 - 1);
        ctx.fillStyle = "#FFD02F";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.fillText(String(val), cx - 8, cy);
      }
    }
    ctx.restore();
  }, [dpr, grid, keyWidth, pxPerBeat, scrollX, selected, timeToX, draftRef]);

  // Setup canvas + ResizeObserver
  useEffect(() => {
    const cvs = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cvs || !wrap) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;

    const size = () => {
      const rect = wrap.getBoundingClientRect();
      const wCss = Math.max(1, Math.floor(rect.width || wrap.clientWidth || 640));
      const hCss = Math.max(40, Math.floor(rect.height || 64));
      cvs.width = Math.floor(wCss * dpr);
      cvs.height = Math.floor(hCss * dpr);
      cvs.style.width = `${wCss}px`;
      cvs.style.height = `${hCss}px`;
      draw();
    };

    size();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(size);
      ro.observe(wrap);
    }
    return () => {
      ro?.disconnect();
    };
  }, [dpr, draw]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cvs = e.currentTarget;
      const rect = cvs.getBoundingClientRect();
      const xCss = e.clientX - rect.left;
      const beat = timeToX ? (xCss - keyWidth + scrollX) / pxPerBeat : 0; // inverse of timeToX
      // find nearest note start within threshold, else note covering beat
      let idx = -1;
      let best = Infinity;
      const pxThresh = 6;
      const beatThresh = Math.max(pxThresh / pxPerBeat, 0.5 / grid);
      const notes = draftRef.current;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i]!;
        const d = Math.abs(beat - n.time);
        if (d <= beatThresh && d < best) {
          best = d;
          idx = i;
        }
      }
      if (idx < 0) {
        for (let i = 0; i < notes.length; i++) {
          const n = notes[i]!;
          if (beat >= n.time && beat <= n.time + n.duration) {
            idx = i;
            break;
          }
        }
      }
      if (idx >= 0) {
        if (e.ctrlKey || e.metaKey) {
          setSelected((prev) =>
            prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b)
          );
        } else {
          setSelected([idx]);
        }
        const v = notes[idx]!.velocity ?? 0.8;
        pointerRef.current = { index: idx, initial: v, pointerId: e.pointerId };
        showTooltipRef.current = true;
        try {
          cvs.setPointerCapture(e.pointerId);
        } catch {}
        onRequestRedraw?.();
        draw();
      }
    },
    [draftRef, grid, keyWidth, onRequestRedraw, pxPerBeat, scrollX, setSelected, draw, timeToX]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = pointerRef.current;
      if (!p) return;
      const cvs = e.currentTarget;
      const rect = cvs.getBoundingClientRect();
      const yCss = e.clientY - rect.top;
      const h = rect.height;
      let vel = 1 - Math.min(1, Math.max(0, (yCss - 2) / Math.max(2, h - 4)));
      vel = Math.max(0.05, Math.min(1, vel));
      const next = draftRef.current.slice();
      if (e.shiftKey && selected.length > 1) {
        for (const i of selected) next[i] = { ...next[i], velocity: vel };
      } else {
        next[p.index] = { ...next[p.index], velocity: vel };
      }
      draftRef.current = next;
      draw();
      onRequestRedraw?.();
    },
    [draftRef, draw, onRequestRedraw, selected]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cvs = e.currentTarget;
      try {
        cvs.releasePointerCapture(e.pointerId);
      } catch {}
      if (pointerRef.current) {
        pointerRef.current = null;
        showTooltipRef.current = false;
        onChange?.(
          draftRef.current.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity }))
        );
      }
    },
    [draftRef, onChange]
  );

  return (
    <div ref={wrapRef} className="mt-1 h-16 w-full overflow-hidden rounded-sm border border-neutral-700 bg-neutral-900">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {}}
      />
    </div>
  );
});
