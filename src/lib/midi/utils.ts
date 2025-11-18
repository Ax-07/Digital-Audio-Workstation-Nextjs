import type { MidiNote } from "@/lib/audio/types";

// GridValue: matches PianoRoll grid options (note subdivisions per whole note)
export type GridValue = 4 | 8 | 12 | 16 | 24 | 32;

/** Quantize an array of MidiNote.
 * Rounds time and duration to nearest grid step.
 * strength (0..1) allows partial shift; 1 = full quantize.
 * Duration is at least one step.
 * No overlap prevention here (handled by caller).
 */
export function quantizeNotes(notes: ReadonlyArray<MidiNote>, grid: GridValue, strength: number = 1): MidiNote[] {
  const step = 1 / grid;
  const out: MidiNote[] = new Array(notes.length);
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const targetTime = Math.round(n.time / step) * step;
    const qTime = n.time + (targetTime - n.time) * strength;
    const targetDur = Math.max(step, Math.round(n.duration / step) * step);
    const qDurBase = n.duration + (targetDur - n.duration) * strength;
    const qDur = Math.max(step, qDurBase);
    out[i] = { pitch: n.pitch, time: Math.max(0, qTime), duration: qDur, velocity: n.velocity };
  }
  return out;
}
