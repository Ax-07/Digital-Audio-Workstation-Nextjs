// src/components/daw/controls/clip-editor/pianoroll/interactions/pointerHandlers.ts

import type { MouseEvent } from "react";
import { getHitAt } from "./hit";
import { setCanvasRectCache } from "./pointerMoveHandler";
import type { DragMode, DraftNote, InteractionState } from "../types";
import type { AudioEngine } from "@/lib/audio/core/audio-engine";
import { GridValue } from "@/lib/audio/types";
import { getSessionPlayer } from "@/lib/audio/core/session-player";
import { startKeyboardPreview } from "./keyboardPreview";

// ================= New grouped context type (additive) =================
export type PointerDownHandlerCtx = {
  refs: {
    canvas: React.RefObject<HTMLCanvasElement | null>;
    draft: React.RefObject<DraftNote[]>;
    interaction: React.RefObject<InteractionState>;
  };
  state: {
    selected: number[];
    loopState: { start: number; end: number } | null;
    loop: { start: number; end: number } | null;
    lengthBeats: number;
    positionStart: number;
  };
  geometry: {
    timeToX: (beat: number) => number;
    pitchToY: (pitch: number) => number;
    xToTime: (xCss: number) => number;
    yToPitch: (yCss: number) => number;
    pxPerSemitone: number;
    keyWidth: number;
    topBarHeight: number;
    maxPitch: number;
  };
  clip: {
    grid: GridValue;
    trackId?: string;
  };
  callbacks: {
    setSelected: (value: number[]) => void;
    setDragMode: (mode: DragMode) => void;
    draw: () => void;
    onPositionChange?: (beat: number) => void;
    onLengthChange?: (beats: number) => void;
  };
  external: {
    audio: AudioEngine;
  };
};

export function createPointerDownHandlerCtx(ctx: PointerDownHandlerCtx) {
  const {
    refs: { canvas, draft, interaction },
    state: { selected, loopState, loop, lengthBeats, positionStart },
    geometry: { timeToX, pitchToY, xToTime, yToPitch, pxPerSemitone, keyWidth, topBarHeight },
    clip: { grid, trackId },
    callbacks: { setSelected, setDragMode, draw, onPositionChange, onLengthChange },
    external: { audio },
  } = ctx;
  return (e: MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvas.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    // Met à jour le cache rect pour déplacements ultérieurs (pointerMove) sans recalcul layout.
    setCanvasRectCache(rect);
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    const hit = getHitAt(
      xCss,
      yCss,
      draft.current,
      timeToX,
      pitchToY,
      (yLocal) => yToPitch(yLocal),
      pxPerSemitone,
      keyWidth,
      topBarHeight,
      loop ?? loopState,
      positionStart,
      lengthBeats
    );
    // note preview
    if (hit.type === "keyboard") {
      const pitch = yToPitch(yCss);
      startKeyboardPreview(pitch, trackId, audio, interaction);
      draw();
      return;
    }
    if (hit.type === "note" && typeof hit.noteIndex === "number") {
      const idx = hit.noteIndex;
      if (!selected.includes(idx)) setSelected([idx]);
      setDragMode("move");
      interaction.current.pointerStart = { x: xCss, y: yCss, noteIndex: idx, initial: draft.current.slice() };
      return;
    }
    if (hit.type === "resize" && typeof hit.noteIndex === "number") {
      const idx = hit.noteIndex;
      if (!selected.includes(idx)) setSelected([idx]);
      setDragMode("resize");
      interaction.current.pointerStart = { x: xCss, y: yCss, noteIndex: idx, initial: draft.current.slice() };
      return;
    }
    if (hit.type === "loopStart") {
      const current = loop ?? loopState ?? { start: 0, end: lengthBeats };
      interaction.current.loopDrag = { kind: "start", x0: xCss, initial: { ...current } };
      setDragMode("loopStart");
      return;
    }
    if (hit.type === "loopEnd") {
      const current = loop ?? loopState ?? { start: 0, end: lengthBeats };
      interaction.current.loopDrag = { kind: "end", x0: xCss, initial: { ...current } };
      setDragMode("loopEnd");
      return;
    }
    if (hit.type === "loopBar") {
      const current = loop ?? loopState;
      if (current) {
        const xStart = timeToX(current.start);
        const xEnd = timeToX(current.end);
        if (xCss >= xStart && xCss <= xEnd && yCss <= topBarHeight) {
          interaction.current.loopDrag = { kind: "move", x0: xCss, initial: { ...current } };
          setDragMode("loopMove");
          return;
        }
      }
    }
    if (hit.type === "clipLength") {
      interaction.current.pointerStart = { x: xCss, y: yCss, noteIndex: null, initial: draft.current.slice(), initialLength: lengthBeats };
      setDragMode("resizeClip");
      return;
    }
    if (hit.type === "positionStart") {
      interaction.current.pointerStart = { x: xCss, y: yCss, noteIndex: null, initial: draft.current.slice() };
      setDragMode("setPlayhead");
      onPositionChange?.(Math.max(0, Math.min(lengthBeats, xToTime(xCss))));
      draw();
      return;
    }
    if (hit.type === "empty" && yCss >= topBarHeight) {
      interaction.current.rectangleSelection = { x0: xCss, y0: yCss, x1: xCss, y1: yCss };
      setDragMode("rectangleSelection");
      draw();
    }
  };
}
