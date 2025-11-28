// src/components/daw/controls/clip-editor/pianoroll/interactions/pointerHandlers.ts

import type { PointerEvent  } from "react";
import { hitTest } from "./hit";
import type { DragMode, DraftNote, InteractionState } from "../types";
import type { AudioEngine } from "@/lib/audio/core/audio-engine";
import { GridValue } from "@/lib/audio/types";
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

/**
 * Commence un drag de notes ou de clip.
 * @param interaction React.RefObject<InteractionState>
 * @param xCss Le déplacement horizontal initial en pixels CSS.
 * @param yCss Le déplacement vertical initial en pixels CSS.
 * @param draft React.RefObject<DraftNote[]>
 * @param options Options additionnelles.
 */
function beginPointerDrag(
  interaction: React.RefObject<InteractionState>,
  xCss: number,
  yCss: number,
  draft: React.RefObject<DraftNote[]>,
  options: {
    noteIndex: number | null;
    initialLength?: number;
  } = { noteIndex: null },
) {
  interaction.current.pointerStart = {
    x: xCss,
    y: yCss,
    noteIndex: options.noteIndex,
    initial: draft.current.slice(),
    initialLength: options.initialLength,
  };
}

/**
 * Commence un drag de loop (start, end, move).
 * @param interaction React.RefObject<InteractionState>
 * @param kind "start" | "end" | "move"
 * @param xCss Le déplacement horizontal initial en pixels CSS.
 * @param loop L'état actuel de la loop.
 */
function beginLoopDrag(
  interaction: React.RefObject<InteractionState>,
  kind: "start" | "end" | "move",
  xCss: number,
  loop: { start: number; end: number },
) {
  interaction.current.loopDrag = {
    kind,
    x0: xCss,
    initial: { ...loop },
  };
}

/**
 * Créateur de gestionnaire pour le pointer down dans le pianoroll.
 * @param ctx Contexte groupé pour le handler.
 * @returns Fonction de gestion du pointer down.
 */
export function createPointerDownHandlerCtx(ctx: PointerDownHandlerCtx) {
  const {
    refs: { canvas, draft, interaction },
    state: { selected, loopState, loop, lengthBeats, positionStart },
    geometry: { timeToX, pitchToY, xToTime, yToPitch, pxPerSemitone, keyWidth, topBarHeight },
    clip: { trackId },
    callbacks: { setSelected, setDragMode, draw, onPositionChange },
    external: { audio },
  } = ctx;
  return (e: PointerEvent<HTMLCanvasElement>) => {
    const cvs = canvas.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    interaction.current.canvasRectCache = rect;
    // Met à jour le cache rect pour déplacements ultérieurs (pointerMove) sans recalcul layout.
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
      positionStart,
      clipLength: lengthBeats,
    });
    // note preview
    if (hit.type === "keyboard") {
      const pitch = yToPitch(yCss);
      startKeyboardPreview(pitch, trackId, audio, interaction);
      draw();
      return;
    }
    // Déplacement de note
    if (hit.type === "note" && typeof hit.noteIndex === "number") {
      const idx = hit.noteIndex;
      if (!selected.includes(idx)) setSelected([idx]);
      setDragMode("move");
      beginPointerDrag(interaction, xCss, yCss, draft, { noteIndex: idx });
      return;
    }
    // Resize de note
    if (hit.type === "resize" && typeof hit.noteIndex === "number") {
      const idx = hit.noteIndex;
      if (!selected.includes(idx)) setSelected([idx]);
      setDragMode("resize");
      beginPointerDrag(interaction, xCss, yCss, draft, { noteIndex: idx });
      return;
    }
    // Déplace le start d'une loop
    if (hit.type === "loopStart") {
      const current = loop ?? loopState ?? { start: 0, end: lengthBeats };
      setDragMode("loopStart");
      beginLoopDrag(interaction, "start", xCss, current);
      return;
    }
    // Déplace la fin d'une loop
    if (hit.type === "loopEnd") {
      const current = loop ?? loopState ?? { start: 0, end: lengthBeats };
      setDragMode("loopEnd");
      beginLoopDrag(interaction, "end", xCss, current);
      return;
    }
    // Déplace toute la loop
    if (hit.type === "loopBar") {
      const current = loop ?? loopState;
      if (current) {
        const xStart = timeToX(current.start);
        const xEnd = timeToX(current.end);
        if (xCss >= xStart && xCss <= xEnd && yCss <= topBarHeight) {
          setDragMode("loopMove");
          beginLoopDrag(interaction, "move", xCss, current);
          return;
        }
      }
    }
    // Resize de la longueur du clip
    if (hit.type === "clipLength") {
      setDragMode("resizeClip");
      beginPointerDrag(interaction, xCss, yCss, draft, { noteIndex: null, initialLength: lengthBeats });
      return;
    }
    // Déplace la position de départ de lecture du clip
    if (hit.type === "positionStart") {
      beginPointerDrag(interaction, xCss, yCss, draft, { noteIndex: null });
      setDragMode("setPlayhead");
      onPositionChange?.(Math.max(0, Math.min(lengthBeats, xToTime(xCss))));
      draw();
      return;
    }
    // Rectangle selection
    if (hit.type === "empty" && yCss >= topBarHeight) {
      interaction.current.rectangleSelection = { x0: xCss, y0: yCss, x1: xCss, y1: yCss };
      setDragMode("rectangleSelection");
      draw();
    }
  };
}
