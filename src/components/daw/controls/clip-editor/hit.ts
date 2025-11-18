// src/components/daw/controls/clip-editor/hit.ts

import type { MidiNote } from "@/lib/audio/types";

export type DraftNote = MidiNote & { __id: number };

export type Hit =
  | { type: "empty" }
  | { type: "note"; noteIndex: number }
  | { type: "resize"; noteIndex: number }
  | { type: "keyboard"; pitch: number }
  | { type: "loopBar" }
  | { type: "loopStart" }
  | { type: "loopEnd" };

const RESIZE_EDGE_PX = 6;

export function getHitAt(
  xCss: number,
  yCss: number,
  notes: ReadonlyArray<DraftNote>,
  timeToX: (beat: number) => number,
  pitchToY: (pitch: number) => number,
  pxPerSemitone: number,
  keyWidth: number,
  loopBarHeight: number,
  loop: { start: number; end: number } | null
): Hit {
  // Check loop handles first (top priority)
  if (loop && yCss <= loopBarHeight) {
    const lx0 = timeToX(loop.start) - keyWidth;
    const lx1 = timeToX(loop.end) - keyWidth;
    if (Math.abs(xCss - keyWidth - lx0) <= 4) return { type: "loopStart" };
    if (Math.abs(xCss - keyWidth - lx1) <= 4) return { type: "loopEnd" };
    if (xCss >= keyWidth + lx0 && xCss <= keyWidth + lx1) return { type: "loopBar" };
  }

  // Check keyboard (left gutter)
  if (xCss < keyWidth) {
    const pitch = Math.floor((yCss + 0) / pxPerSemitone);
    return { type: "keyboard", pitch };
  }

  // Check notes (reverse order for z-index)
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    const nx = timeToX(n.time);
    const ny = pitchToY(n.pitch);
    const nw = timeToX(n.time + n.duration) - nx;
    const nh = pxPerSemitone;

    if (xCss >= nx && xCss <= nx + nw && yCss >= ny && yCss <= ny + nh) {
      // Check if on right edge for resize
      if (xCss >= nx + nw - RESIZE_EDGE_PX) {
        return { type: "resize", noteIndex: i };
      }
      return { type: "note", noteIndex: i };
    }
  }

  return { type: "empty" };
}
