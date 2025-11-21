import type { DraftNote } from "../types";
import { findNextNoteAfterTime, hasOverlapOnPitch, NotesIndex } from "./notesIndex";

export function snapToNoteEdges(
  beat: number,
  pitch: number,
  notes: ReadonlyArray<DraftNote>,
  grid: number,
  snap: boolean,
  exclude: ReadonlySet<number> | null
): number {
  if (!snap) return beat;
  const threshold = 1 / grid / 2;
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
    if (nextTime < otherEnd && end > other.time) {
      if (nextTime < other.time) {
        clamped = Math.min(clamped, other.time - duration);
      } else {
        clamped = Math.max(clamped, otherEnd);
      }
    }
  }
  return Math.max(0, clamped);
}

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
    if (other.time > time && other.time < end) {
      clamped = Math.max(minDur, other.time - time);
    }
  }
  return clamped;
}

/**
 * Variante optimisée de clampMoveAvoidOverlap qui s'appuie sur un index par pitch.
 * - idx : index de la note dans draftNotes
 * - nextTime : nouveau time proposé
 * - duration : durée de la note
 * - pitch : pitch de la note
 * - notes : tableau complet des notes
 * - index : NotesIndex (groupé par pitch, trié par time)
 */
export function clampMoveAvoidOverlapIndexed(
  idx: number,
  nextTime: number,
  duration: number,
  pitch: number,
  notes: ReadonlyArray<DraftNote>,
  index: NotesIndex,
  exclude: ReadonlySet<number>,
): number {
  const original = notes[idx]!;
  const end = nextTime + duration;

  // Empêche le move de créer un chevauchement avec d'autres notes sur ce pitch
  if (hasOverlapOnPitch(index, pitch, nextTime, end, exclude)) {
    // On peut essayer de snapper entre les notes voisines
    // Ici, on se contente de revenir à la position d'origine pour éviter les artefacts.
    return original.time;
  }

  return nextTime;
}

/**
 * Variante optimisée de clampResizeAvoidOverlap basée sur l'index de pitch.
 */
export function clampResizeAvoidOverlapIndexed(
  idx: number,
  time: number,
  nextDuration: number,
  pitch: number,
  grid: number,
  notes: ReadonlyArray<DraftNote>,
  index: NotesIndex,
  exclude: ReadonlySet<number>,
): number {
  const minDur = 1 / grid;
  let clamped = Math.max(minDur, nextDuration);
  const end = time + clamped;

  // On cherche la note suivante sur ce pitch pour limiter la durée si besoin
  const nextNote = findNextNoteAfterTime(index, pitch, time, exclude);
  if (nextNote && nextNote.note.time < end) {
    clamped = Math.max(minDur, nextNote.note.time - time);
  }

  return clamped;
}