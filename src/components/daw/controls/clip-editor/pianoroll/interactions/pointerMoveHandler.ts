// src/components/daw/controls/clip-editor/pianoroll/interactions/pointerMoveHandler.ts

import type { MouseEvent } from "react";
import { getHitAt, type DraftNote } from "../hit";
import type { DragMode, PointerStartState, RectangleSelectionState, LoopDragState, DragGuideState, CursorType } from "../types";
import { GridValue } from "@/lib/audio/types";
import type { AudioEngine } from "@/lib/audio/core/audio-engine";

export function createPointerMoveHandler(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  draftRef: React.RefObject<DraftNote[]>,
  dragMode: DragMode,
  selected: number[],
  setSelected: (value: number[]) => void,
  setCursor: (cursor: CursorType) => void,
  pointerStartRef: React.RefObject<PointerStartState>,
  rectangleSelectionRef: React.RefObject<RectangleSelectionState>,
  loopDragRef: React.RefObject<LoopDragState>,
  dragGuideRef: React.RefObject<DragGuideState>,
  hoverNoteRef: React.RefObject<number | null>,
  hoverPitchRef: React.RefObject<number | null>,
  ghostRef: React.RefObject<{ time: number; pitch: number } | null>,
  loopState: { start: number; end: number } | null,
  setLoopState: (loop: { start: number; end: number } | null) => void,
  loopStateRef: React.RefObject<{ start: number; end: number } | null>,
  timeToX: (beat: number) => number,
  pitchToY: (pitch: number) => number,
  xToTime: (xCss: number) => number,
  yToPitch: (yCss: number) => number,
  snapBeat: (beat: number) => number,
  clampMoveAvoidOverlap: (idx: number, nextTime: number, duration: number, pitch: number, exclude: ReadonlySet<number>) => number,
  clampResizeAvoidOverlap: (idx: number, time: number, nextDuration: number, pitch: number, exclude: ReadonlySet<number>) => number,
  pxPerBeat: number,
  pxPerSemitone: number,
  keyWidth: number,
  loopBarHeight: number,
  minPitch: number,
  maxPitch: number,
  grid: GridValue,
  lengthBeats: number,
  loop: { start: number; end: number } | null,
  draw: () => void,
  emitDraftThrottled: () => void,
  emitLoopChangeThrottled: () => void,
  // Keyboard glide support
  pressedKeyRef: React.RefObject<number | null>,
  audio: AudioEngine
) {
  return (e: MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;

    if (!dragMode) {
      // Hover detection
      const hit = getHitAt(
        xCss,
        yCss,
        draftRef.current,
        timeToX,
        pitchToY,
        pxPerSemitone,
        keyWidth,
        loopBarHeight,
        loop ?? loopState
      );

      if (hit.type === "resize") {
        setCursor("ew-resize");
        if (typeof hit.noteIndex === "number") hoverNoteRef.current = hit.noteIndex;
      } else if (hit.type === "note") {
        setCursor("pointer");
        if (typeof hit.noteIndex === "number") hoverNoteRef.current = hit.noteIndex;
      } else if (hit.type === "loopStart" || hit.type === "loopEnd") {
        setCursor("ew-resize");
      } else if (hit.type === "keyboard") {
        // Hover state for keyboard
        hoverPitchRef.current = hit.pitch ?? null;
        // If primary button is held, glide between keys
        if (e.buttons === 1) {
          const nextPitch = yToPitch(yCss);
          const current = pressedKeyRef.current;
          if (current == null) {
            pressedKeyRef.current = nextPitch;
            audio.startPreviewNote(nextPitch, { velocity: 0.8 });
          } else if (current !== nextPitch) {
            try {
              audio.stopPreviewNote(current);
            } finally {
              pressedKeyRef.current = nextPitch;
              audio.startPreviewNote(nextPitch, { velocity: 0.8 });
            }
          }
        }
        setCursor("default");
      } else if (hit.type === "loopBar") {
        const current = loop ?? loopState;
        if (current) {
          const xStart = timeToX(current.start);
          const xEnd = timeToX(current.end);
          if (xCss >= xStart && xCss <= xEnd && yCss <= loopBarHeight) {
            setCursor("pointer");
          } else {
            setCursor("crosshair");
          }
        } else {
          setCursor("crosshair");
        }
        hoverNoteRef.current = null;
        hoverPitchRef.current = null;
        ghostRef.current = null;
      } else {
        setCursor("crosshair");
        hoverNoteRef.current = null;
        hoverPitchRef.current = null;
        const beat = xToTime(xCss);
        const pitch = yToPitch(yCss);
        ghostRef.current = xCss >= keyWidth ? { time: snapBeat(beat), pitch } : null;
      }
      draw();
      return;
    }

    // Move notes
    if (dragMode === "move" && pointerStartRef.current && typeof pointerStartRef.current.noteIndex === "number") {
      const dx = xCss - pointerStartRef.current.x;
      const dy = yCss - pointerStartRef.current.y;
      const dBeat = dx / pxPerBeat;
      const dPitch = -Math.round(dy / pxPerSemitone);

      const sel = new Set(selected);
      const next = pointerStartRef.current.initial.slice();

      for (let i = 0; i < next.length; i++) {
        if (!sel.has(i)) continue;
        const n = next[i]!;
        const rawTime = n.time + dBeat;
        const rawPitch = n.pitch + dPitch;
        const time = e.shiftKey ? rawTime : snapBeat(rawTime);
        const pitch = Math.max(minPitch, Math.min(maxPitch, rawPitch));
        const clamped = clampMoveAvoidOverlap(i, time, n.duration, pitch, new Set());
        next[i] = { ...n, time: Math.max(0, clamped), pitch };
      }

      draftRef.current = next;
      const primary = next[pointerStartRef.current.noteIndex];
      if (primary) {
        dragGuideRef.current = {
          xCss: timeToX(primary.time),
          yCss: pitchToY(primary.pitch),
          beat: primary.time,
          pitch: primary.pitch,
        };
      }
      draw();
      emitDraftThrottled();
      return;
    }

    // Resize notes
    if (dragMode === "resize" && pointerStartRef.current && typeof pointerStartRef.current.noteIndex === "number") {
      const dx = xCss - pointerStartRef.current.x;
      const dBeat = dx / pxPerBeat;

      const sel = new Set(selected);
      const next = pointerStartRef.current.initial.slice();

      for (let i = 0; i < next.length; i++) {
        if (!sel.has(i)) continue;
        const n = next[i]!;
        const rawDur = n.duration + dBeat;
        const snapped = e.shiftKey ? rawDur : snapBeat(rawDur);
        const minDur = 1 / grid;
        const clamped = clampResizeAvoidOverlap(i, n.time, snapped, n.pitch, new Set());
        next[i] = { ...n, duration: Math.max(minDur, clamped) };
      }

      draftRef.current = next;
      draw();
      emitDraftThrottled();
      return;
    }

    // Rectangle selection
    if (dragMode === "rectangleSelection" && rectangleSelectionRef.current) {
      rectangleSelectionRef.current.x1 = xCss;
      rectangleSelectionRef.current.y1 = yCss;

      const m = rectangleSelectionRef.current;
      const rx0 = Math.min(m.x0, m.x1);
      const rx1 = Math.max(m.x0, m.x1);
      const ry0 = Math.min(m.y0, m.y1);
      const ry1 = Math.max(m.y0, m.y1);

      const newSel: number[] = [];
      for (let i = 0; i < draftRef.current.length; i++) {
        const n = draftRef.current[i]!;
        const nx = timeToX(n.time);
        const ny = pitchToY(n.pitch);
        const nw = timeToX(n.time + n.duration) - nx;
        const nh = pxPerSemitone;

        if (nx + nw >= rx0 && nx <= rx1 && ny + nh >= ry0 && ny <= ry1) {
          newSel.push(i);
        }
      }

      setSelected(newSel);
      draw();
      return;
    }

    // Loop start/end dragging
    if ((dragMode === "loopStart" || dragMode === "loopEnd") && loopDragRef.current) {
      const dx = xCss - loopDragRef.current.x0;
      const dBeat = dx / pxPerBeat;
      const step = 1 / grid;
      const { start, end } = loopDragRef.current.initial;
      if (loopDragRef.current.kind === "start") {
        let nextStart = e.shiftKey ? start + dBeat : snapBeat(start + dBeat);
        nextStart = Math.max(0, Math.min(nextStart, end - step));
        const nextLoop = { start: nextStart, end } as const;
        loopStateRef.current = nextLoop;
        setLoopState(nextLoop);
        emitLoopChangeThrottled();
      } else {
        let nextEnd = e.shiftKey ? end + dBeat : snapBeat(end + dBeat);
        nextEnd = Math.min(lengthBeats, Math.max(start + step, nextEnd));
        const nextLoop = { start, end: nextEnd } as const;
        loopStateRef.current = nextLoop;
        setLoopState(nextLoop);
        emitLoopChangeThrottled();
      }
      draw();
      return;
    }

    // Loop move dragging
    if (dragMode === "loopMove" && loopDragRef.current) {
      const dx = xCss - loopDragRef.current.x0;
      const dBeat = dx / pxPerBeat;
      const { start, end } = loopDragRef.current.initial;
      const duration = Math.max(0, end - start);
      let nextStart = e.shiftKey ? start + dBeat : snapBeat(start + dBeat);
      nextStart = Math.max(0, Math.min(lengthBeats - duration, nextStart));
      const nextEnd = nextStart + duration;
      const nextLoop = { start: nextStart, end: nextEnd } as const;
      loopStateRef.current = nextLoop;
      setLoopState(nextLoop);
      emitLoopChangeThrottled();
      draw();
    }
  };
}
