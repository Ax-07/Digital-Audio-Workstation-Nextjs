// src/components/daw/controls/clip-editor/utils.ts

import type { DraftNote } from "./hit";

/**
 * Snap to nearest note edge on the same pitch when snap is enabled
 */
export function snapToNoteEdges(
  beat: number,
  pitch: number,
  notes: ReadonlyArray<DraftNote>,
  grid: number,
  snap: boolean,
  exclude: ReadonlySet<number> | null
): number {
  if (!snap) return beat;

  const threshold = 1 / grid / 2; // Half a grid step
  let closest = beat;
  let minDist = Infinity;

  for (let i = 0; i < notes.length; i++) {
    if (exclude?.has(i)) continue;
    const n = notes[i]!;
    if (n.pitch !== pitch) continue;

    const distStart = Math.abs(beat - n.time);
    const distEnd = Math.abs(beat - (n.time + n.duration));

    if (distStart < minDist && distStart <= threshold) {
      minDist = distStart;
      closest = n.time;
    }
    if (distEnd < minDist && distEnd <= threshold) {
      minDist = distEnd;
      closest = n.time + n.duration;
    }
  }

  return closest;
}

/**
 * Clamp move to avoid overlap with other notes on the same pitch
 */
export function clampMoveAvoidOverlap(
  idx: number,
  nextTime: number,
  duration: number,
  pitch: number,
  notes: ReadonlyArray<DraftNote>,
  exclude: ReadonlySet<number>
): number {
  const end = nextTime + duration;
  let clamped = nextTime;

  for (let i = 0; i < notes.length; i++) {
    if (i === idx || exclude.has(i)) continue;
    const other = notes[i]!;
    if (other.pitch !== pitch) continue;

    const otherEnd = other.time + other.duration;

    // If we overlap, adjust
    if (nextTime < otherEnd && end > other.time) {
      // Try to push to the right of the obstacle
      if (nextTime < other.time) {
        clamped = Math.min(clamped, other.time - duration);
      } else {
        clamped = Math.max(clamped, otherEnd);
      }
    }
  }

  return Math.max(0, clamped);
}

/**
 * Clamp resize to avoid overlap
 */
export function clampResizeAvoidOverlap(
  idx: number,
  time: number,
  nextDuration: number,
  pitch: number,
  notes: ReadonlyArray<DraftNote>,
  grid: number,
  exclude: ReadonlySet<number>
): number {
  const minDur = 1 / grid;
  let clamped = Math.max(minDur, nextDuration);
  const end = time + clamped;

  for (let i = 0; i < notes.length; i++) {
    if (i === idx || exclude.has(i)) continue;
    const other = notes[i]!;
    if (other.pitch !== pitch) continue;

    // If extending into another note, clamp duration
    if (other.time > time && other.time < end) {
      clamped = Math.max(minDur, other.time - time);
    }
  }

  return clamped;
}
