// src/components/daw/controls/clip-editor/pianoroll/interactions/doubleClickHandler.ts

import type { PointerEvent } from "react";
import { hitTest } from "./hit";
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

export function createDoubleClickHandlerCtx(ctx: DoubleClickHandlerCtx) {
  const {
    refs: { canvas, draft },
    callbacks: { setSelected, emitFrom },
    coords: { timeToX, pitchToY, xToTime, yToPitch },
    ui: { pxPerSemitone, keyWidth, topBarHeight },
    state: { grid, loop, loopState },
  } = ctx;

  return (e: PointerEvent<HTMLCanvasElement>) => {
    const cvs = canvas.current;
    if (!cvs) return;

    const rect = cvs.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;

    const hit = hitTest({
      xCss,
      yCss,
      notes: draft.current,
      timeToX,
      pitchToY,
      yToPitch,
      pxPerSemitone,
      keyWidth,
      topBarHeight,
      loop: loop ?? loopState,
      // positionStart: undefined,
      // clipLength: undefined,
    });

    // --- Double click on a note → remove it ---
    if (hit.type === "note" && typeof hit.noteIndex === "number") {
      handleDeleteNote({ draft, setSelected, emitFrom, noteIndex: hit.noteIndex });
      return;
    }

    // --- Double click on empty area → create a note ---
    if (hit.type === "empty" && xCss >= keyWidth) {
      handleCreateNote({
        draft,
        setSelected,
        emitFrom,
        xCss,
        yCss,
        xToTime,
        yToPitch,
        grid,
      });
      return;
    }
  };
}

type DeleteNoteArgs = {
  draft: React.RefObject<DraftNote[]>;
  setSelected: (value: number[]) => void;
  emitFrom: (arr: DraftNote[]) => void;
  noteIndex: number;
};

export const handleDeleteNote = ({ draft, setSelected, emitFrom, noteIndex }: DeleteNoteArgs) => {
  const cur = draft.current;
  if (!cur) return;
  const next = cur.filter((_n, i) => i !== noteIndex);
  setSelected([]);
  emitFrom(next);
};

type CreateNoteArgs = {
  draft: React.RefObject<DraftNote[]>;
  setSelected: (value: number[]) => void;
  emitFrom: (arr: DraftNote[]) => void;
  xCss: number;
  yCss: number;
  xToTime: (xCss: number) => number;
  yToPitch: (yCss: number) => number;
  grid: GridValue;
};

export const handleCreateNote = ({
  draft,
  setSelected,
  emitFrom,
  xCss,
  yCss,
  xToTime,
  yToPitch,
  grid,
}: CreateNoteArgs) => {
  const cur = draft.current ?? [];
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

  const next = [...cur, newNote];
  setSelected([next.length - 1]);
  emitFrom(next);
};