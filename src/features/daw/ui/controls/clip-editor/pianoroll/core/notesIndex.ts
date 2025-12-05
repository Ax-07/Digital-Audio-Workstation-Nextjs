// src/components/daw/controls/clip-editor/pianoroll/core/notesIndex.ts
import type { DraftNote } from "../types";

export type NoteRef = {
  index: number;       // index dans draftNotes
  note: DraftNote;
};

export type NotesByPitch = Map<number, NoteRef[]>;

export type NotesIndex = {
  byPitch: NotesByPitch;
};

/**
 * Construit un index par pitch à partir de la liste de notes.
 * - Groupement par pitch
 * - Tri par time à l'intérieur de chaque pitch
 * 
 * À appeler quand `draftNotes` change (ex: lors d'un nouvel ensemble de notes).
 * Tu peux le stocker dans un useRef pour éviter de le recalculer sur chaque move.
 */
export function buildNotesIndex(notes: ReadonlyArray<DraftNote>): NotesIndex {
  const byPitch: NotesByPitch = new Map();

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    let arr = byPitch.get(n.pitch);
    if (!arr) {
      arr = [];
      byPitch.set(n.pitch, arr);
    }
    arr.push({ index: i, note: n });
  }

  // Tri par time pour chaque pitch (important pour les clamps / hit-tests efficaces)
  for (const arr of byPitch.values()) {
    arr.sort((a, b) => a.note.time - b.note.time);
  }

  return { byPitch };
}

/**
 * Retourne la liste triée des notes d'un pitch donné.
 * Renvoie [] si aucune note à ce pitch.
 */
export function getNotesForPitch(
  index: NotesIndex,
  pitch: number,
): NoteRef[] {
  return index.byPitch.get(pitch) ?? [];
}

/**
 * Utilitaire pour trouver la note suivante qui commence après un temps donné
 * sur un pitch donné. Renvoie null s'il n'y en a pas.
 */
export function findNextNoteAfterTime(
  index: NotesIndex,
  pitch: number,
  time: number,
  exclude: ReadonlySet<number>,
): NoteRef | null {
  const list = index.byPitch.get(pitch);
  if (!list || list.length === 0) return null;

  // Comme c'est trié par time, on peut faire une simple boucle ou une binary search.
  // Boucle simple pour rester lisible (optimisable plus tard).
  for (let i = 0; i < list.length; i++) {
    const ref = list[i]!;
    if (exclude.has(ref.index)) continue;
    if (ref.note.time > time) {
      return ref;
    }
  }

  return null;
}

/**
 * Trouve s'il y a un chevauchement avec une note existante sur un pitch donné,
 * pour un segment [time, end).
 * Renvoie true si une note (hors `exclude`) chevauche ce range.
 */
export function hasOverlapOnPitch(
  index: NotesIndex,
  pitch: number,
  time: number,
  end: number,
  exclude: ReadonlySet<number>,
): boolean {
  const list = index.byPitch.get(pitch);
  if (!list || list.length === 0) return false;

  for (let i = 0; i < list.length; i++) {
    const ref = list[i]!;
    if (exclude.has(ref.index)) continue;
    const n = ref.note;
    const nStart = n.time;
    const nEnd = n.time + n.duration;

    // [time, end) chevauche [nStart, nEnd) ?
    if (nStart < end && nEnd > time) {
      return true;
    }
  }

  return false;
}
