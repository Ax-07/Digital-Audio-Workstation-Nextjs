// src/components/daw/controls/clip-editor/pianoroll/PianoRollToolbar.tsx
"use client";

import { memo, useCallback } from "react";

type GridValue = 4 | 8 | 16 | 32;

export type PianoRollToolbarProps = {
  grid: GridValue;
  setGrid: (g: GridValue) => void;
  snap: boolean;
  setSnap: (s: boolean) => void;
  pxPerBeat: number; // 16–192
  setPxPerBeat: (v: number) => void;
  className?: string;
};

export const PianoRollToolbar = memo(function PianoRollToolbar({
  grid,
  setGrid,
  snap,
  setSnap,
  pxPerBeat,
  setPxPerBeat,
  className,
}: PianoRollToolbarProps) {
  const onChangeGrid = useCallback<React.ChangeEventHandler<HTMLSelectElement>>(
    (e) => setGrid(Number(e.target.value) as GridValue),
    [setGrid]
  );

  const onToggleSnap = useCallback(() => setSnap(!snap), [setSnap, snap]);

  const onZoomChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (e) => setPxPerBeat(Number(e.target.value)),
    [setPxPerBeat]
  );

  return (
    <div
      className={
        "flex items-center gap-3 px-3 py-2 border-b border-neutral-700 bg-neutral-800 text-neutral-100 " +
        (className ?? "")
      }
      role="toolbar"
      aria-label="Piano roll toolbar"
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-neutral-400">Grid</span>
        <select
          value={grid}
          onChange={onChangeGrid}
          className="h-7 rounded-sm bg-neutral-700 text-neutral-100 text-xs px-2 outline-none focus:ring-1 focus:ring-yellow-400"
          aria-label="Grid resolution"
        >
          <option value={4}>1/4</option>
          <option value={8}>1/8</option>
          <option value={16}>1/16</option>
          <option value={32}>1/32</option>
        </select>
      </div>

      <button
        type="button"
        onClick={onToggleSnap}
        className={
          "h-7 px-3 rounded-sm text-xs transition-colors " +
          (snap
            ? "bg-yellow-500/80 hover:bg-yellow-500 text-black"
            : "bg-neutral-700 hover:bg-neutral-600 text-neutral-100")
        }
        aria-pressed={snap}
        aria-label="Toggle snap to grid"
        title="Snap to grid"
      >
        Snap {snap ? "On" : "Off"}
      </button>

      <div className="flex items-center gap-2 ml-2">
        <span className="text-[10px] uppercase tracking-widest text-neutral-400">Zoom</span>
        <input
          type="range"
          min={16}
          max={192}
          step={1}
          value={pxPerBeat}
          onChange={onZoomChange}
          className="w-40 accent-yellow-400"
          aria-label="Horizontal zoom"
        />
        <span className="text-xs tabular-nums w-10 text-right">{Math.round(pxPerBeat)}</span>
      </div>
    </div>
  );
});
