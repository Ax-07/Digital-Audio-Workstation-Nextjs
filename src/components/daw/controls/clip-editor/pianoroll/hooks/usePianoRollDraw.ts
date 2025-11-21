import { useCallback, useEffect, useRef } from "react";
import type { InteractionState, PerfStats, DraftNote } from "../types";
import type { RenderContext, DrawState } from "../rendering/renderContext";
import { drawBaseCanvas } from "../rendering/drawBase";
import { drawOverlayCanvas } from "../rendering/drawOverlay";

/**
 * Centralise la logique de dessin (base + overlay) pour le Piano Roll.
 * Objectif: alléger le composant principal et faciliter les tests ciblés.
 */
export function usePianoRollDraw(
  params: {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
    ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
    interactionRef: React.RefObject<InteractionState>;
    renderCtxRef: React.RefObject<RenderContext>;
    overlayCtxRef: React.RefObject<{
      dpr: number; active: boolean; position: number | undefined; playheadBeat: number | undefined; lengthBeats: number; timeToX: (b: number) => number; lastPlayhead: number | null;
    }>;
    culledBufferRef: React.RefObject<DraftNote[]>;
    perfRef: React.RefObject<PerfStats>;
    drawFnRef: React.RefObject<(() => void) | null>;
  }
) {
  const { canvasRef, overlayCanvasRef, ctxRef, interactionRef, renderCtxRef, overlayCtxRef, culledBufferRef, perfRef, drawFnRef } = params;
  const overlayLastTsRef = useRef(0);
  const lastDrawnPlayheadRef = useRef<number | null>(null);

  const drawBase = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = ctxRef.current;
    if (!cvs || !ctx) return;
    const renderCtx = renderCtxRef.current;
    const drawState: DrawState = {
      pressedPitch: interactionRef.current.pressedKey,
      hoverPitch: interactionRef.current.hoverPitch,
      hoverNote: interactionRef.current.hoverNote,
      ghost: interactionRef.current.ghost,
      rectangleSelection: interactionRef.current.rectangleSelection,
      dragGuide: interactionRef.current.dragGuide,
      pointerStart: interactionRef.current.pointerStart,
    };
    const t0 = performance.now();
    const stats = drawBaseCanvas(ctx, cvs, renderCtx.draftNotes, renderCtx, drawState, culledBufferRef.current);
    const t1 = performance.now();
    perfRef.current.lastDrawMs = t1 - t0;
    perfRef.current.visible = stats.visible;
    perfRef.current.total = stats.total;
  }, [canvasRef, ctxRef, culledBufferRef, interactionRef, perfRef, renderCtxRef]);

  const drawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const o = overlayCtxRef.current;
    // Throttle overlay during high-frequency drags to reduce cost
    const dm = interactionRef.current.dragMode;
    const isHighFreqDrag = dm === "move" || dm === "resize" || dm === "rectangleSelection";
    if (isHighFreqDrag) {
      const now = performance.now();
      if (now - overlayLastTsRef.current < 33) {
        return; // ~30Hz max for overlay while dragging
      }
      overlayLastTsRef.current = now;
    }
    // Skip redraw if playhead hasn't changed and no position cursor to show
    if (!isHighFreqDrag) {
      const ph = typeof o.playheadBeat === "number" ? o.playheadBeat : o.lastPlayhead;
      if (o.position == null && ph === lastDrawnPlayheadRef.current) {
        return;
      }
    }
    drawOverlayCanvas(overlay, o.dpr, o.active, o.position, o.playheadBeat, o.lastPlayhead, o.lengthBeats, o.timeToX);
    // Remember last drawn playhead to avoid redundant draws at idle
    lastDrawnPlayheadRef.current = typeof o.playheadBeat === "number" ? o.playheadBeat : (o.lastPlayhead ?? null);
  }, [interactionRef, overlayCanvasRef, overlayCtxRef]);

  const draw = useCallback(() => {
    drawBase();
    drawOverlay();
  }, [drawBase, drawOverlay]);

  // Expose draw via ref pour scheduler externe.
  useEffect(() => {
    drawFnRef.current = draw;
  }, [draw, drawFnRef]);

  return { draw, drawOverlay } as const;
}
