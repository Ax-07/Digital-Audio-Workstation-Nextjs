// src/components/daw/controls/pianoroll/Toolbar.tsx

"use client";

import { memo } from "react";

export type GridValue = 4 | 8 | 12 | 16 | 24 | 32;

export type PianoRollToolbarProps = {
  pxPerBeat: number;
  setPxPerBeat: (v: number) => void;
  pxPerSemitone: number;
  setPxPerSemitone: (v: number) => void;
  grid: GridValue;
  setGrid: (v: GridValue) => void;
  snap: boolean;
  setSnap: (v: boolean) => void;
  snapEdges: boolean;
  setSnapEdges: (v: boolean) => void;
  onQuantize: () => void;
};

export const PianoRollToolbar = memo(function PianoRollToolbar({
  pxPerBeat,
  setPxPerBeat,
  pxPerSemitone,
  setPxPerSemitone,
  grid,
  setGrid,
  snap,
  setSnap,
  snapEdges,
  setSnapEdges,
  onQuantize,
}: PianoRollToolbarProps) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-neutral-300">
      <span className="text-neutral-400">Zoom</span>
      <input type="range" min={16} max={192} step={1} value={pxPerBeat} onChange={(e) => setPxPerBeat(Number(e.target.value))} />
      <span className="text-neutral-400">Hauteur</span>
      <input type="range" min={6} max={24} step={1} value={pxPerSemitone} onChange={(e) => setPxPerSemitone(Number(e.target.value))} />
      <span className="ml-2 text-neutral-400">Grille</span>
      <select value={grid} onChange={(e) => setGrid(Number(e.target.value) as GridValue)} className="rounded-sm bg-neutral-900 px-1">
        <option value={4}>1/4</option>
        <option value={8}>1/8</option>
        <option value={12}>1/8T</option>
        <option value={16}>1/16</option>
        <option value={24}>1/16T</option>
        <option value={32}>1/32</option>
      </select>
      <label className="ml-2 inline-flex items-center gap-1">
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        Snap
      </label>
      <label className="ml-2 inline-flex items-center gap-1">
        <input type="checkbox" checked={snapEdges} onChange={(e) => setSnapEdges(e.target.checked)} />
        Snap bords
      </label>
      <button
        className="ml-2 rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
        onClick={onQuantize}
      >
        Quantize
      </button>
    </div>
  );
});
