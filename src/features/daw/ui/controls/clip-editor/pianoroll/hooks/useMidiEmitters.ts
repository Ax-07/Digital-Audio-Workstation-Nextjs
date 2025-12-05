import { useCallback } from "react";
import type { DraftNote } from "../types";
import { useThrottle } from "./useThrottle";
import { draftToMidi } from "../core/midiConversion";
import { MidiNote } from "@/core/audio-engine/types";

/**
 * Regroupe la logique d'émission des changements de notes (draft VS commit) afin
 * d'alléger le composant PianoRoll et faciliter les tests unitaires.
 */
export function useMidiEmitters(
  params: {
    active: boolean;
    onDraftChange?: (notes: MidiNote[]) => void;
    onChange?: (notes: MidiNote[]) => void;
    draftRef: React.RefObject<DraftNote[]>;
    invalidate: () => void; // déclenche un redraw
    throttleMs?: number;
  }
) {
  const { active, onDraftChange, onChange, draftRef, invalidate, throttleMs = 80 } = params;

  // Conversion réutilisable (pure) pour tests.
  const toMidi = useCallback(
    (arr: DraftNote[]): MidiNote[] => draftToMidi(arr),
    []
  );

  // Emission throttlée des brouillons (drag en cours, resize...).
  const emitDraftThrottled = useThrottle(
    () => {
      if (!onDraftChange) return;
      onDraftChange(toMidi(draftRef.current));
    },
    throttleMs,
    active
  );

  // Emission finale (commit) après pointerUp.
  const emitFrom = useCallback(
    (next: DraftNote[]) => {
      draftRef.current = next;
      invalidate();
      onChange?.(toMidi(next));
    },
    [draftRef, invalidate, onChange, toMidi]
  );

  return {
    toMidi,
    emitDraftThrottled,
    emitFrom,
  } as const;
}
