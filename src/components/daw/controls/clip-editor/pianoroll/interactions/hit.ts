// src/components/daw/controls/clip-editor/pianoroll/interactions/hit.ts

import { NoteRef } from "../core/notesIndex";
import type { DraftNote } from "../types";

export type Hit =
  | { type: "empty" }
  | { type: "note"; noteIndex: number }
  | { type: "resize"; noteIndex: number }
  | { type: "keyboard"; pitch: number }
  | { type: "loopBar" }
  | { type: "loopStart" }
  | { type: "loopEnd" }
  | { type: "positionStart" }
  | { type: "clipLength" };

const RESIZE_EDGE_PX = 12; // Tolérance en pixels pour le hit-test de resize sur le bord droit d'une note

/**
 * getHitAt
 *
 * Détecte ce qui est sous le pointeur :
 * - top bar (clip length / position / loop)
 * - clavier à gauche
 * - notes (avec gestion du resize via bord droit)
 *
 * Optimisation :
 *  - supporte une fonction optionnelle `getNotesForPitch(pitch)` pour éviter
 *    de boucler sur toutes les notes à chaque hit-test (utilisée si fournie).
 */
export function getHitAt(
  xCss: number,
  yCss: number,
  notes: ReadonlyArray<DraftNote>,
  timeToX: (beat: number) => number,
  pitchToY: (pitch: number) => number,
  yToPitch: (yCss: number) => number,
  pxPerSemitone: number,
  keyWidth: number,
  topBarHeight: number,
  loop: { start: number; end: number } | null,
  positionStart?: number,
  clipLength?: number,
  getNotesForPitch?: (pitch: number) => ReadonlyArray<NoteRef>,
): Hit {
  // ================= TOP BAR =================
  // Tiers : 0 = clip length, 1 = position, 2 = loop
  if (yCss <= topBarHeight) {
    const barH = Math.max(1, Math.floor(topBarHeight / 3));
    const localY = yCss;
    const tier = Math.min(2, Math.floor(localY / barH));
    const xLocal = xCss - keyWidth;
    const hitTol = 4; // px

    // --- Tier 0 : Clip length ---
    if (tier === 0 && typeof clipLength === "number") {
      const clipX = timeToX(clipLength) - keyWidth;
      if (xLocal >= 0 && Math.abs(xLocal - clipX) <= hitTol) {
        return { type: "clipLength" };
      }
    }

    // --- Tier 1 : Position start ---
    if (tier === 1 && typeof positionStart === "number") {
      const posX = timeToX(positionStart) - keyWidth;
      if (xLocal >= 0 && Math.abs(xLocal - posX) <= hitTol) {
        return { type: "positionStart" };
      }
    }

    // --- Tier 2 : Loop ---
    if (tier === 2 && loop) {
      const lx0 = timeToX(loop.start) - keyWidth;
      const lx1 = timeToX(loop.end) - keyWidth;

      if (Math.abs(xLocal - lx0) <= hitTol) return { type: "loopStart" };
      if (Math.abs(xLocal - lx1) <= hitTol) return { type: "loopEnd" };
      if (xLocal >= 0 && xLocal >= lx0 && xLocal <= lx1) {
        return { type: "loopBar" };
      }
    }

    // On est dans la top bar mais rien de précis touché
    return { type: "empty" };
  }

  // ================= CLAVIER =================
  // Gutter gauche, sous la top bar
  if (xCss < keyWidth && yCss > topBarHeight) {
    const pitch = yToPitch(yCss);
    return { type: "keyboard", pitch };
  }

  // ================= NOTES =================
  // Optimisation : si on a un accès indexé par pitch, on l'utilise.
  // Sinon, fallback sur le scan complet en reverse (pour respecter le z-order).
  const hitFromIndexed = (() => {
    if (!getNotesForPitch) return null;

    const pitch = yToPitch(yCss);
    const candidates = getNotesForPitch(pitch);
    if (!candidates || candidates.length === 0) return null;

    // On part du dernier (supposé au-dessus si plusieurs sur le même pitch)
    for (let i = candidates.length - 1; i >= 0; i--) {
      const { index, note } = candidates[i]!;
      const nx = timeToX(note.time);
      const ny = pitchToY(note.pitch);
      const nw = timeToX(note.time + note.duration) - nx;
      const nh = pxPerSemitone;

      if (xCss >= nx && xCss <= nx + nw && yCss >= ny && yCss <= ny + nh) {
        if (xCss >= nx + nw - RESIZE_EDGE_PX) {
          return { type: "resize", noteIndex: index } as Hit;
        }
        return { type: "note", noteIndex: index } as Hit;
      }
    }

    return null;
  })();

  if (hitFromIndexed) {
    return hitFromIndexed;
  }

// Fallback : scan complet des notes (reverse order pour z-index, dernières notes dessinées au-dessus)
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    const nx = timeToX(n.time);
    const ny = pitchToY(n.pitch);
    const nw = timeToX(n.time + n.duration) - nx;
    const nh = pxPerSemitone;

    if (xCss >= nx && xCss <= nx + nw && yCss >= ny && yCss <= ny + nh) {
      if (xCss >= nx + nw - RESIZE_EDGE_PX) {
        return { type: "resize", noteIndex: i };
      }
      return { type: "note", noteIndex: i };
    }
  }

  return { type: "empty" };
}
