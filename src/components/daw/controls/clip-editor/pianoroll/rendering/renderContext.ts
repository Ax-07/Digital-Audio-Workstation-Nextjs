// src/components/daw/controls/clip-editor/pianoroll/rendering/renderContext.ts

import { GridValue } from "@/lib/audio/types";
import type { DraftNote } from "../types";

export type RenderContext = {
  dpr: number;                                              // Device Pixel Ratio for high-DPI screens
  keyWidth: number;                                         // Width of the piano keyboard area in pixels
  scrollX: number;                                          // Horizontal scroll position in pixels
  scrollY: number;                                          // Vertical scroll position in pixels
  pxPerBeat: number;                                        // Pixels per beat (horizontal zoom level)
  pxPerSemitone: number;                                    // Pixels per semitone (vertical zoom level)
  minPitch: number;                                         // Minimum MIDI pitch visible
  maxPitch: number;                                         // Maximum MIDI pitch visible
  grid: GridValue;                                    // Grid subdivision for snapping and drawing
  topBarHeight: number;                                    // Height of the loop bar area in pixels
  lengthBeats: number;                                      // Total length of the clip in beats
  positionStart: number;                                   // Current playhead position in beats
  selected: number[];                                       // Indices of currently selected notes
  selectedSet: ReadonlySet<number>;                         // Fast lookup for selection during draw
  draftNotes: DraftNote[];                                  // Array of draft notes being edited
  loop: { start: number; end: number } | null;              // Loop points in beats, or null if no loop
  loopState: { start: number; end: number } | null;         // Temporary loop state during editing
  timeToX: (beat: number) => number;                        // Convert time in beats to x-coordinate in pixels
  xToTime: (xCss: number) => number;                        // Convert x-coordinate in pixels to time in beats
  pitchToY: (pitch: number) => number;                      // Convert MIDI pitch to y-coordinate in pixels
  yToPitch: (yCss: number) => number;                       // Convert y-coordinate in pixels to MIDI pitch 
};

export type OverlayContext = {
  dpr: number; 
  active: boolean; 
  position: number | undefined; 
  playheadBeat: number | undefined; 
  lengthBeats: number; timeToX: (b: number) => number;
  lastPlayhead: number | null
}

export type DrawState = {
  pressedPitch: number | null;
  hoverPitch: number | null;
  hoverNote: number | null;
  ghost: { time: number; pitch: number } | null;
  rectangleSelection: { x0: number; y0: number; x1: number; y1: number } | null;
  dragGuide: { xCss: number; yCss: number; beat: number; pitch: number } | null;
  pointerStart: { x: number; y: number; noteIndex: number | null; initial: DraftNote[] } | null;
};

/**
 * Met à jour le contexte de rendu avec de nouvelles valeurs.
 * @param renderCtx 
 * @param updates 
 */
export function updateRenderCtx(
  renderCtx: RenderContext,
  updates: Partial<RenderContext>
) {
  Object.assign(renderCtx, updates);
}

export function commitRenderChangesAndDraw(
  renderCtx: RenderContext,
  updates: Partial<RenderContext>,
  draw: () => void
) {
  updateRenderCtx(renderCtx, updates);
  draw();
}