// src/components/daw/controls/pianoroll/LoopControls.tsx

"use client";

import { memo } from "react";
import type { GridValue } from "@/lib/audio/types";

export type LoopRange = { start: number; end: number } | null;

export type LoopControlsProps = {
  grid: GridValue;
  lengthBeats: number;
  current: LoopRange;
  onSet: (next: LoopRange) => void;
  onDraw?: () => void;
  // For "Sel" helper: provider to avoid ref access during render
  getNotes: () => ReadonlyArray<{ time: number; duration: number }>;
  selected: ReadonlyArray<number>;
};

export const LoopControls = memo(function LoopControls({ grid, lengthBeats, current, onSet, onDraw, getNotes, selected }: LoopControlsProps) {
  const step = 1 ;

  const setOn = () => { const next = { start: 0, end: lengthBeats }; onSet(next); onDraw?.(); };
  const setOff = () => { onSet(null); onDraw?.(); };

  const onChangeStart = (v: number) => {
    const val = Number.isFinite(v) ? v : 0;
    const cur = current ?? { start: 0, end: lengthBeats };
    const next = { start: Math.max(0, val), end: Math.max(0, cur.end) };
    if (next.end <= next.start) next.end = next.start + step;
    onSet(next); onDraw?.();
  };
  const onChangeEnd = (v: number) => {
    const val = Number.isFinite(v) ? v : lengthBeats;
    const cur = current ?? { start: 0, end: lengthBeats };
    const next = { start: Math.max(0, cur.start), end: Math.max(0, val) };
    if (next.end <= next.start) next.start = Math.max(0, next.end - step);
    onSet(next); onDraw?.();
  };

  const setToSelection = () => {
    const notes = getNotes();
    if (!notes.length) return;
    const indices = selected.length ? selected : notes.map((_n, i) => i);
    if (!indices.length) return;
    let minT = Infinity, maxT = -Infinity;
    for (const i of indices) {
      const n = notes[i]!; if (!n) continue;
      minT = Math.min(minT, n.time);
      maxT = Math.max(maxT, n.time + n.duration);
    }
    if (!(Number.isFinite(minT) && Number.isFinite(maxT) && maxT > minT)) return;
    const next = { start: Math.max(0, minT), end: Math.min(lengthBeats, maxT) };
    onSet(next); onDraw?.();
  };

  const isOn = !!current;
  const startVal = current ? current.start : 0;
  const endVal = current ? current.end : lengthBeats;

  return (
    <div className="ml-2 flex items-center gap-2">
      <span className="text-neutral-400">Loop</span>
      <button
        className={
          "rounded-sm border px-2 py-1 transition-colors " +
          (isOn
            ? "border-amber-500 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            : "border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700")
        }
        title={isOn ? "Désactiver la boucle" : "Activer la boucle"}
        onClick={() => (isOn ? setOff() : setOn())}
      >{isOn ? "On" : "Off"}</button>

      <input
        type="number"
        inputMode="decimal"
        className="h-6 w-16 rounded-sm border border-neutral-700 bg-neutral-800 px-1 text-[11px] text-neutral-200"
        step={step}
        min={0}
        value={Math.max(0, Math.round(startVal / step) * step)}
        onChange={(e) => onChangeStart(parseFloat(e.target.value))}
        title="Début (beats)"
      />
      <span className="text-neutral-500">→</span>
      <input
        type="number"
        inputMode="decimal"
        className="h-6 w-16 rounded-sm border border-neutral-700 bg-neutral-800 px-1 text-[11px] text-neutral-200"
        step={step}
        min={0}
        value={Math.max(0, Math.round(endVal / step) * step)}
        onChange={(e) => onChangeEnd(parseFloat(e.target.value))}
        title="Fin (beats)"
      />

      <button
        className="rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
        title="Boucler le clip entier"
        onClick={setOn}
      >Clip</button>

      <button
        className="rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
        title="Boucler sur la sélection"
        onClick={setToSelection}
      >Sel</button>

      <button
        className="rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
        title="Supprimer la boucle"
        onClick={setOff}
      >Clear</button>
    </div>
  );
});
