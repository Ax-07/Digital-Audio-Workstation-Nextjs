"use client";

import { GridValue, MidiNote } from "@/core/audio-engine/types";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";

type Lane = {
  id: string;
  name: string;
  pitch: number;
};

const DEFAULT_LANES: readonly Lane[] = [
  { id: "kick", name: "Kick", pitch: 36 },
  { id: "snare", name: "Snare", pitch: 38 },
  { id: "rim", name: "Rim", pitch: 37 },
  { id: "clap", name: "Clap", pitch: 39 },
  { id: "tomL", name: "Tom Low", pitch: 41 },
  { id: "ch", name: "HH Closed", pitch: 42 },
  { id: "tomF", name: "Tom Floor", pitch: 43 },
  { id: "tomM", name: "Tom Mid", pitch: 45 },
  { id: "oh", name: "HH Open", pitch: 46 },
  { id: "tomH", name: "Tom High", pitch: 48 },
  { id: "crash1", name: "Crash 1", pitch: 49 },
  { id: "crash2", name: "Crash 2", pitch: 57 },
  { id: "ride", name: "Ride", pitch: 51 },
  { id: "rideBell", name: "Ride Bell", pitch: 53 },
  { id: "splash", name: "Splash", pitch: 55 },
  { id: "china", name: "China", pitch: 52 }
] as const;

export type DrumRollProps = {
  notes: ReadonlyArray<MidiNote>;
  lengthBeats: number;
  grid: GridValue; // 4,8,12,16,24,32
  onChange: (next: MidiNote[]) => void;
  lanes?: readonly Lane[];
  velocity?: number; // 0..1
  onPreview?: (pitch: number) => void; // preview au clic
};


/**
* Convertit une valeur de grille en nombre de beats par pas.
* - 4 -> 1/4, 8 -> 1/8, 16 -> 1/16, 32 -> 1/32
* - 12 -> 1/12 (8T), 24 -> 1/24 (16T),
* @param grid 
 * @returns 
 */
function beatsPerStep(grid: GridValue): number {
  return 1 / (grid / 4);
}

/**
 * Arrondit une valeur de temps en beats à la précision 1/1024 beat.
 * @param v - valeur en beats
 * @returns 
 */
function roundBeat(v: number): number {
  // Stabilise les flottants à 1/1024 beat près
  return Math.round(v * 1024) / 1024;
}

export const DrumRoll = memo(function DrumRoll({
  notes,
  lengthBeats,
  grid,
  onChange,
  lanes = DEFAULT_LANES,
  velocity = 0.9,
  onPreview,
}: DrumRollProps) {
  const stepBeat = beatsPerStep(grid);
  const stepsPerBeat = 1 / stepBeat; // ex: grid=16 => 4 steps/beat
  const totalSteps = Math.max(1, Math.round(lengthBeats * stepsPerBeat));
  // Pré-calcul des indexes des steps pour éviter de recréer des tableaux dans le render
  const steps = useMemo(() => {
    const arr: number[] = new Array(totalSteps);
    for (let i = 0; i < totalSteps; i++) arr[i] = i;
    return arr;
  }, [totalSteps]);

  // Refs pour synchroniser le scroll vertical entre lanes et grille
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const g = gridRef.current;
    const l = lanesRef.current;
    if (!g || !l) return;
    const onScroll = () => {
      l.scrollTop = g.scrollTop;
    };
    g.addEventListener("scroll", onScroll, { passive: true });
    return () => g.removeEventListener("scroll", onScroll);
  }, []);

  // Indexation des notes existantes par clé "pitch@time"
  const noteKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      const t = roundBeat(n.time);
      set.add(`${n.pitch}@${t}`);
    }
    return set;
  }, [notes]);

  // Accès rapide aux notes par clé pour suppression
  const noteByKey = useMemo(() => {
    const map = new Map<string, MidiNote>();
    for (const n of notes) {
      const t = roundBeat(n.time);
      map.set(`${n.pitch}@${t}`, n);
    }
    return map;
  }, [notes]);

  const toggleStep = useCallback(
    (pitch: number, stepIndex: number) => {
      const time = roundBeat(stepIndex * stepBeat);
      const key = `${pitch}@${time}`;
      const existing = noteByKey.get(key);
      if (existing) {
        // remove
        const next = notes.filter((n) => n !== existing);
        onChange(next);
        if (onPreview) onPreview(pitch);
        return;
      }
      // add
      const duration = stepBeat; // une case = 1 pas
      // id provisoire stable: `${pitch}-${time}` (le store pourra régénérer si besoin)
      const newNote: MidiNote = {
        id: `${pitch}-${time}`,
        pitch,
        time,
        duration,
        velocity,
      };
      const next = [...notes, newNote].sort((a, b) => a.time - b.time || a.pitch - b.pitch);
      onChange(next);
      if (onPreview) onPreview(pitch);
      console.log("Added note", newNote);
      console.log("Next notes", next);
    },
    [noteByKey, notes, onChange, stepBeat, velocity, onPreview]
  );

  // Rendu simple en grille CSS (performant, pas de canvas pour commencer)
  return (
    <div className="flex h-full select-none overflow-hidden">
      {/* Légendes des lanes */}
      <div ref={lanesRef} className="w-32 shrink-0 border-r border-neutral-800 bg-neutral-950/60 overflow-y-auto">
        {lanes.map((lane) => (
          <div key={lane.id} className="h-4 flex items-center px-2 text-[11px] text-neutral-300 border-b border-neutral-900 box-border">
            <span className="truncate">{lane.name}</span>
            <span className="ml-auto text-[10px] text-neutral-500">{lane.pitch}</span>
          </div>
        ))}
      </div>

      {/* Grille des pas */}
      <div ref={gridRef} className="flex-1 overflow-auto">
        <div
          className="min-w-full"
          style={{
            // largeur min = totalSteps * 24px (24px = tailwind w-6)
            minWidth: `${totalSteps * 24}px`,
          }}
        >
          {lanes.map((lane, rowIdx) => (
            <div key={lane.id} className="flex h-4 border-b border-neutral-900">
              {steps.map((_, stepIdx) => {
                const time = roundBeat(stepIdx * stepBeat);
                const key = `${lane.id}-${stepIdx}`;
                const isOn = noteKeySet.has(`${lane.pitch}@${time}`);
                const isBeatStart = stepIdx % stepsPerBeat === 0;
                return (
                  <button
                    key={key}
                    onClick={() => toggleStep(lane.pitch, stepIdx)}
                    style={{ width: 24, boxSizing: "border-box" }}
                    className={
                      `flex-none h-full border-l ${isBeatStart ? "border-neutral-700" : "border-neutral-800"} ` +
                      (isOn
                        ? "bg-emerald-500/90 hover:bg-emerald-400"
                        : (rowIdx % 2 === 0
                            ? "bg-neutral-900/60 hover:bg-neutral-800"
                            : "bg-neutral-900/40 hover:bg-neutral-800/70"))
                    }
                    title={`${lane.name} @ ${time.toFixed(3)}b`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
