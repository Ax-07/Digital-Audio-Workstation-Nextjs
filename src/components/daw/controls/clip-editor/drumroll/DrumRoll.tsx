"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GridValue } from "@/lib/audio/types";
import type { MidiNote } from "@/lib/audio/types";

type Lane = {
  id: string;
  name: string;
  pitch: number;
};

const DEFAULT_LANES: readonly Lane[] = [
  { id: "kick", name: "Kick", pitch: 36 },
  { id: "snare", name: "Snare", pitch: 38 },
  { id: "ch", name: "HH Closed", pitch: 42 },
  { id: "oh", name: "HH Open", pitch: 46 },
  { id: "clap", name: "Clap", pitch: 39 },
  { id: "rim", name: "Rim", pitch: 37 },
  { id: "tomL", name: "Tom Low", pitch: 41 },
  { id: "tomH", name: "Tom High", pitch: 48 },
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

function beatsPerStep(grid: GridValue): number {
  // 4 -> 1/4, 8 -> 1/8, 12 -> 1/12 (8T), 16 -> 1/16, 24 -> 1/24 (16T), 32 -> 1/32
  return 1 / (grid / 4);
}

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
    },
    [noteByKey, notes, onChange, stepBeat, velocity, onPreview]
  );

  // Rendu simple en grille CSS (performant, pas de canvas pour commencer)
  return (
    <div className="flex h-full select-none">
      {/* Légendes des lanes */}
      <div className="w-36 shrink-0 border-r border-neutral-800 bg-neutral-950/60">
        {lanes.map((lane) => (
          <div key={lane.id} className="h-8 flex items-center px-2 text-[11px] text-neutral-300 border-b border-neutral-900">
            <span className="truncate">{lane.name}</span>
            <span className="ml-auto text-[10px] text-neutral-500">{lane.pitch}</span>
          </div>
        ))}
      </div>

      {/* Grille des pas */}
      <div className="flex-1 overflow-auto">
        <div
          className="min-w-full"
          style={{
            // largeur min = totalSteps * 24px
            minWidth: `${totalSteps * 24}px`,
          }}
        >
          {lanes.map((lane, rowIdx) => (
            <div key={lane.id} className="flex h-8 border-b border-neutral-900">
              {Array.from({ length: totalSteps }).map((_, stepIdx) => {
                const time = roundBeat(stepIdx * stepBeat);
                const key = `${lane.pitch}@${time}`;
                const isOn = noteKeySet.has(key);
                const isBeatStart = stepIdx % stepsPerBeat === 0;
                return (
                  <button
                    key={stepIdx}
                    onClick={() => toggleStep(lane.pitch, stepIdx)}
                    className={
                      `w-6 h-full border-r ${isBeatStart ? "border-neutral-700" : "border-neutral-800"} ` +
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
