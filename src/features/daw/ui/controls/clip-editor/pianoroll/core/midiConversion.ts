import { MidiNote } from "@/core/audio-engine/types";
import type { DraftNote } from "../types";

let __idCounter = 0;

export function draftToMidi(
  draft: DraftNote[],
  idStrategy?: (note: DraftNote, index: number) => string
): MidiNote[] {
  return draft.map((n, i) => {
    const existing = (n as unknown as MidiNote).id as string | undefined;
    const id =
      existing ||
      (idStrategy ? idStrategy(n, i) : crypto?.randomUUID?.() || `d_${Date.now()}_${__idCounter++}`);
    return {
      id,
      pitch: n.pitch,
      time: n.time,
      duration: n.duration,
      velocity: n.velocity ?? 0.8,
    };
  });
}

export function ensureMidiIds(draft: DraftNote[]): MidiNote[] {
  return draftToMidi(draft);
}
