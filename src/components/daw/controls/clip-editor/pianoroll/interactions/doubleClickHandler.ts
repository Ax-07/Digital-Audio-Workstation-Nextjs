// src/components/daw/controls/clip-editor/pianoroll/interactions/doubleClickHandler.ts

import type { MouseEvent } from "react";
import { getHitAt } from "./hit";
import type { GridValue } from "@/lib/audio/types";
import type { DraftNote } from "../types";

export type DoubleClickHandlerCtx = {
  refs: {
    canvas: React.RefObject<HTMLCanvasElement | null>;
    draft: React.RefObject<DraftNote[]>;
  };
  callbacks: {
    setSelected: (value: number[]) => void;
    emitFrom: (arr: DraftNote[]) => void;
  };
  coords: {
    timeToX: (beat: number) => number;
    pitchToY: (pitch: number) => number;
    xToTime: (xCss: number) => number;
    yToPitch: (yCss: number) => number;
  };
  ui: {
    pxPerSemitone: number;
    keyWidth: number;
    topBarHeight: number;
  };
  state: {
    grid: GridValue;
    loop: { start: number; end: number } | null;
    loopState: { start: number; end: number } | null;
  };
};

export function createDoubleClickHandler(ctx: DoubleClickHandlerCtx) {
  const {
    refs: { canvas, draft },
    callbacks: { setSelected, emitFrom },
    coords: { timeToX, pitchToY, xToTime, yToPitch },
    ui: { pxPerSemitone, keyWidth, topBarHeight },
    state: { grid, loop, loopState },
  } = ctx;

  return (e: MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvas.current;
    if (!cvs) return;

    const rect = cvs.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;

    const hit = getHitAt(
      xCss,
      yCss,
      draft.current,
      timeToX,
      pitchToY,
      yToPitch,
      pxPerSemitone,
      keyWidth,
      topBarHeight,
      loop ?? loopState,
      undefined,  // positionStart
      undefined   // clipLength
      // getNotesForPitch non utilisé ici
    );

    // --- Double click on a note → remove it ---
    if (hit.type === "note" && typeof hit.noteIndex === "number") {
      const idx = hit.noteIndex;
      const next = draft.current.filter((_n, i) => i !== idx);
      setSelected([]);
      emitFrom(next);
      return;
    }

    // --- Double click on empty area → create a note ---
    if (hit.type === "empty" && xCss >= keyWidth) {
      const beat = xToTime(xCss);
      const step = 1 / grid;
      const pitch = yToPitch(yCss);

      const newNote: DraftNote = {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        pitch,
        time: Math.max(0, Math.floor(beat / step) * step),
        duration: step,
        velocity: 0.8,
        __id: Date.now(),
      };

      const next = [...draft.current, newNote];
      setSelected([next.length - 1]);
      emitFrom(next);
      return;
    }
  };
}
