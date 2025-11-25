// src/components/daw/controls/clip-editor/pianoroll/interactions/pointerUpHandler.ts

import type { DragMode, DraftNote, InteractionState } from "../types";
import type { AudioEngine } from "@/lib/audio/core/audio-engine";
import { stopKeyboardPreview } from "./keyboardPreview";

export type PointerUpHandlerCtx = {
  refs: {
    draft: React.RefObject<DraftNote[]>;
    interaction: React.RefObject<InteractionState>;
  };
  state: {
    loopState: { start: number; end: number } | null;
  };
  clip: {
    trackId?: string;
  };
  callbacks: {
    setSelected: (value: number[]) => void;
    setDragMode: (mode: DragMode) => void;
    emitFrom: (notes: DraftNote[]) => void;
    onLoopChange?: (loop: { start: number; end: number } | null) => void;
    invalidate: () => void;
  };
  external: {
    audio: AudioEngine;
  };
};

/**
 * Crée le handler de pointerUp (et pointerLeave) pour le PianoRoll.
 * - stop la note de preview clavier
 * - pousse l’édition de notes dans le store (emitFrom)
 * - finalise les drags de loop
 * - applique la sélection rectangle
 * - reset l’état d’interaction
 */
export function createPointerUpHandlerCtx(ctx: PointerUpHandlerCtx) {
  const {
    refs: { draft, interaction },
    state: { loopState },
    clip: { trackId },
    callbacks: { setSelected, setDragMode, emitFrom, onLoopChange, invalidate },
    external: { audio },
  } = ctx;

  return () => {
    const inter = interaction.current;
    const dragMode = inter.dragMode;

    // 1) Stop preview clavier (si une note est en cours)
    stopKeyboardPreview(trackId, interaction);

    // 2) Si on était en drag de notes, on commit le draft via emitFrom
    if (dragMode && inter.pointerStart) {
      emitFrom(draft.current);
    }

    // 3) Loop : start/end/move → on propage la loopState finale au parent
    if (
      (dragMode === "loopStart" ||
        dragMode === "loopEnd" ||
        dragMode === "loopMove") &&
      inter.loopDrag
    ) {
      const next = loopState ? { ...loopState } : null;
      onLoopChange?.(next);
      inter.loopDrag = null;
    }

    // 4) Rectangle selection : on applique la sélection construite pendant le drag
    if (dragMode === "rectangleSelection") {
      setSelected(inter.selected);
    }

    // 5) Reset de l’état d’interaction
    inter.pointerStart = null;
    inter.rectangleSelection = null;
    inter.dragGuide = null;

    // 6) Sort du mode de drag + redraw
    setDragMode(null);
    invalidate();
  };
}
