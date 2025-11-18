import type { MidiNote } from "@/lib/audio/types";

export type DraftNote = MidiNote & { __id: number };

export function snapToNoteEdges(
  beat: number,
  pitch: number,
  notes: ReadonlyArray<DraftNote>,
  grid: 4 | 8 | 12 | 16 | 24 | 32,
  snapEnabled: boolean,
  exclude?: ReadonlySet<number> | null
): number {
  if (!snapEnabled) return beat;
  let best = beat;
  let bestDist = Infinity;
  for (let i = 0; i < notes.length; i++) {
    if (exclude?.has(i)) continue;
    const n = notes[i]!;
    if (n.pitch !== pitch) continue;
    const t0 = n.time;
    const t1 = n.time + n.duration;
    const d0 = Math.abs(t0 - beat);
    if (d0 < bestDist) { bestDist = d0; best = t0; }
    const d1 = Math.abs(t1 - beat);
    if (d1 < bestDist) { bestDist = d1; best = t1; }
  }
  const step = 1 / grid;
  return bestDist <= step * 0.5 ? best : beat;
}

export function clampMoveAvoidOverlap(
  idx: number,
  nextTime: number,
  duration: number,
  pitch: number,
  notes: ReadonlyArray<DraftNote>,
  exclude: ReadonlySet<number>
): number {
  let prevEnd: number | null = null;
  let nextStart: number | null = null;
  for (let i = 0; i < notes.length; i++) {
    if (exclude.has(i)) continue;
    const n = notes[i]!;
    if (n.pitch !== pitch) continue;
    if (n.time + n.duration <= nextTime) {
      if (prevEnd == null || n.time + n.duration > prevEnd) prevEnd = n.time + n.duration;
    } else if (n.time >= nextTime + 1e-9) {
      if (nextStart == null || n.time < nextStart) nextStart = n.time;
    }
  }
  let t = nextTime;
  if (prevEnd != null) t = Math.max(t, prevEnd);
  if (nextStart != null) t = Math.min(t, nextStart - duration);
  return Math.max(0, t);
}

export function clampResizeAvoidOverlap(
  idx: number,
  time: number,
  nextDuration: number,
  pitch: number,
  notes: ReadonlyArray<DraftNote>,
  grid: 4 | 8 | 12 | 16 | 24 | 32,
  exclude: ReadonlySet<number>
): number {
  let maxEnd = Infinity;
  for (let i = 0; i < notes.length; i++) {
    if (exclude.has(i)) continue;
    const n = notes[i]!;
    if (n.pitch !== pitch) continue;
    if (n.time >= time) {
      if (n.time < maxEnd) maxEnd = n.time;
    }
  }
  const end = time + nextDuration;
  if (maxEnd !== Infinity && end > maxEnd) {
    return Math.max(1 / grid, maxEnd - time);
  }
  return Math.max(1 / grid, nextDuration);
}
