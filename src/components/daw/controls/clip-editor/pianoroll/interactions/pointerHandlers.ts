// src/components/daw/controls/clip-editor/pianoroll/interactions/pointerHandlers.ts

import type { MouseEvent } from "react";
import { getHitAt, type DraftNote } from "../hit";
import type { DragMode, PointerStartState, RectangleSelectionState, LoopDragState } from "../types";
import type { AudioEngine } from "@/lib/audio/core/audio-engine";
import { GridValue } from "@/lib/audio/types";

export function createPointerDownHandler(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  draftRef: React.RefObject<DraftNote[]>,
  selected: number[],
  setSelected: (value: number[]) => void,
  setDragMode: (mode: DragMode) => void,
  pointerStartRef: React.RefObject<PointerStartState>,
  rectangleSelectionRef: React.RefObject<RectangleSelectionState>,
  loopDragRef: React.RefObject<LoopDragState>,
  pressedKeyRef: React.RefObject<number | null>,
  audio: AudioEngine,
  timeToX: (beat: number) => number,
  pitchToY: (pitch: number) => number,
  xToTime: (xCss: number) => number,
  yToPitch: (yCss: number) => number,
  snapBeat: (beat: number) => number,
  pxPerSemitone: number,
  keyWidth: number,
  loopBarHeight: number,
  maxPitch: number,
  grid: GridValue,
  lengthBeats: number,
  loop: { start: number; end: number } | null,
  loopState: { start: number; end: number } | null,
  draw: () => void,
  emitDraftThrottled: () => void
) {
  return (e: MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;

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

    // Keyboard preview — map using yToPitch to account for scroll/scale
    if (hit.type === "keyboard" && typeof hit.pitch === "number") {
      const pitch = yToPitch(yCss);
      pressedKeyRef.current = pitch;
      audio.startPreviewNote(pitch, { velocity: 0.8 });
      draw();
      return;
    }

    // Select and start moving note
    if (hit.type === "note" && typeof hit.noteIndex === "number") {
      const idx = hit.noteIndex;
      if (!selected.includes(idx)) {
        setSelected([idx]);
      }
      setDragMode("move");
      pointerStartRef.current = {
        x: xCss,
        y: yCss,
        noteIndex: idx,
        initial: draftRef.current.slice(),
      };
      return;
    }

    // Start resizing note
    if (hit.type === "resize" && typeof hit.noteIndex === "number") {
      const idx = hit.noteIndex;
      if (!selected.includes(idx)) {
        setSelected([idx]);
      }
      setDragMode("resize");
      pointerStartRef.current = {
        x: xCss,
        y: yCss,
        noteIndex: idx,
        initial: draftRef.current.slice(),
      };
      return;
    }

    // Create new note by simple click in grid area
    if (hit.type === "empty" && xCss >= keyWidth) {
      const beat = snapBeat(xToTime(xCss));
      const pitch = yToPitch(yCss);
      const step = 1 / grid;
      const newNote: DraftNote = {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        pitch,
        time: Math.max(0, beat),
        duration: step,
        velocity: 0.8,
        __id: Date.now(),
      };
      const next = [...draftRef.current, newNote];
      draftRef.current = next;
      const newIdx = next.length - 1;
      setSelected([newIdx]);
      setDragMode("resize");
      pointerStartRef.current = {
        x: xCss,
        y: yCss,
        noteIndex: newIdx,
        initial: next.slice(),
      };
      draw();
      emitDraftThrottled();
      return;
    }

    // Loop handles drag start
    if (hit.type === "loopStart") {
      const current = loop ?? loopState ?? { start: 0, end: lengthBeats };
      loopDragRef.current = { kind: "start", x0: xCss, initial: { ...current } };
      setDragMode("loopStart");
      return;
    }
    if (hit.type === "loopEnd") {
      const current = loop ?? loopState ?? { start: 0, end: lengthBeats };
      loopDragRef.current = { kind: "end", x0: xCss, initial: { ...current } };
      setDragMode("loopEnd");
      return;
    }

    // Loop move
    if (hit.type === "loopBar") {
      const current = loop ?? loopState;
      if (current) {
        const xStart = timeToX(current.start);
        const xEnd = timeToX(current.end);
        if (xCss >= xStart && xCss <= xEnd && yCss <= loopBarHeight) {
          loopDragRef.current = { kind: "move", x0: xCss, initial: { ...current } };
          setDragMode("loopMove");
          return;
        }
      }
    }

    // Start rectangle selection (Shift-drag on empty or loop bar)
    if ((hit.type === "empty" || hit.type === "loopBar") && e.shiftKey) {
      rectangleSelectionRef.current = { x0: xCss, y0: yCss, x1: xCss, y1: yCss };
      setDragMode("rectangleSelection");
      draw();
    }
  };
}
