import { useCallback, useMemo } from "react";
import type { KeyboardEvent } from "react";

import {
  createPointerDownHandlerCtx,
  createPointerMoveHandlerCtx,
  createPointerUpHandlerCtx,
  createDoubleClickHandler,
  type PointerDownHandlerCtx,
  type PointerMoveHandlerCtx,
  type PointerUpHandlerCtx,
  type DoubleClickHandlerCtx,
} from "./index";

import type { DraftNote, DragMode, InteractionState } from "../types";
import type { GridValue } from "@/lib/audio/types";
import type { RenderContext } from "../rendering/renderContext";
import type { AudioEngine } from "@/lib/audio/core/audio-engine";

// --------- Types d'entrée / sortie du hook ---------

export type PianoRollHandlersInput = {
  refs: {
    canvas: React.RefObject<HTMLCanvasElement | null>;
    overlayCanvas?: React.RefObject<HTMLCanvasElement | null>;
    draft: React.RefObject<DraftNote[]>;
    interaction: React.RefObject<InteractionState>;
    render: React.RefObject<RenderContext>;
    loopState: React.RefObject<{ start: number; end: number } | null>;
  };
  state: {
    selected: number[];
    setSelected: (value: number[]) => void;
    dragMode: DragMode;
    setDragMode: (mode: DragMode) => void;
    loop: { start: number; end: number } | null;
    loopState: { start: number; end: number } | null;
    lengthBeats: number;
    position?: number;
  };
  coords: {
    timeToX: (beat: number) => number;
    pitchToY: (pitch: number) => number;
    xToTime: (xCss: number) => number;
    yToPitch: (yCss: number) => number;
  };
  ui: {
    pxPerBeat: number;
    pxPerSemitone: number;
    keyWidth: number;
    topBarHeight: number;
    minPitch: number;
    maxPitch: number;
    grid: GridValue;
  };
  clip: {
    trackId?: string;
  };
  helpers: {
    snapBeat: (beat: number) => number;
    clampMoveAvoidOverlap: (
      idx: number,
      nextTime: number,
      duration: number,
      pitch: number,
      exclude: ReadonlySet<number>,
    ) => number;
    clampResizeAvoidOverlap: (
      idx: number,
      time: number,
      nextDuration: number,
      pitch: number,
      exclude: ReadonlySet<number>,
    ) => number;
    getNotesForPitch: (pitch: number) => { index: number; note: DraftNote }[] | undefined;
  };
  callbacks: {
    draw: () => void;
    emitDraftThrottled: () => void;
    emitFrom: (notes: DraftNote[]) => void;
    emitLoopChangeThrottled: () => void;
    onPositionChange?: (beat: number) => void;
    onLengthChange?: (beats: number) => void;
    onLoopChange?: (loop: { start: number; end: number } | null) => void;
    onChange?: (notes: DraftNote[]) => void;
    setLoopState: (loop: { start: number; end: number } | null) => void;
  };
  misc: {
    invalidate: () => void;
    setCursorStyle: (cursor: string) => void;
    audio: AudioEngine;
  };
};

export type PianoRollHandlersOutput = {
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onDoubleClick: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
};

export function usePianoRollHandlers(input: PianoRollHandlersInput): PianoRollHandlersOutput {
  const {
    refs: { canvas, draft, interaction, render, loopState: loopStateRef },
    state: { selected, setSelected, dragMode, setDragMode, loop, loopState, lengthBeats, position },
    coords: { timeToX, pitchToY, xToTime, yToPitch },
    ui: {
      pxPerBeat,
      pxPerSemitone,
      keyWidth,
      topBarHeight,
      minPitch,
      maxPitch,
      grid,
    },
    clip: { trackId },
    helpers: {
      snapBeat,
      clampMoveAvoidOverlap,
      clampResizeAvoidOverlap,
      getNotesForPitch,
    },
    callbacks: {
      draw,
      emitDraftThrottled,
      emitFrom,
      emitLoopChangeThrottled,
      onPositionChange,
      onLengthChange,
      onLoopChange,
      onChange,
      setLoopState,
    },
    misc: { invalidate, setCursorStyle, audio },
  } = input;

  // ---------- pointerDown ----------
  const pointerDownCtx = useMemo<PointerDownHandlerCtx>(
    () => ({
      refs: { canvas, draft, interaction },
      state: {
        selected,
        loopState,
        loop: loop ?? null,
        lengthBeats,
        positionStart: position || 0,
      },
      geometry: {
        timeToX,
        pitchToY,
        xToTime,
        yToPitch,
        pxPerSemitone,
        keyWidth,
        topBarHeight,
        maxPitch,
      },
      clip: { grid, trackId },
      callbacks: { setSelected, setDragMode, draw, onPositionChange, onLengthChange },
      external: { audio },
    }),
    [
      canvas,
      draft,
      interaction,
      selected,
      loopState,
      loop,
      lengthBeats,
      position,
      timeToX,
      pitchToY,
      xToTime,
      yToPitch,
      pxPerSemitone,
      keyWidth,
      topBarHeight,
      maxPitch,
      grid,
      trackId,
      setSelected,
      setDragMode,
      draw,
      onPositionChange,
      onLengthChange,
      audio,
    ],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const handler = createPointerDownHandlerCtx(pointerDownCtx);
      handler(e);
    },
    [pointerDownCtx],
  );

  // ---------- pointerMove ----------
  const pointerMoveCtx = useMemo<PointerMoveHandlerCtx>(
    () => ({
      refs: {
        canvas,
        draft,
        render,
        interaction,
        loopState: loopStateRef,
      },
      state: {
        dragMode,
        selected,
        loopState,
        loop: loop ?? null,
        positionStart: position || 0,
      },
      geometry: {
        timeToX,
        pitchToY,
        xToTime,
        yToPitch,
        pxPerBeat,
        pxPerSemitone,
        keyWidth,
        topBarHeight,
        minPitch,
        maxPitch,
      },
      clip: { grid, lengthBeats, trackId },
      helpers: {
        snapBeat,
        clampMoveAvoidOverlap,
        clampResizeAvoidOverlap,
        getNotesForPitch,
      },
      callbacks: {
        setSelected,
        setCursor: setCursorStyle,
        setLoopState,
        draw,
        emitDraftThrottled,
        emitLoopChangeThrottled,
        onPositionChange,
        onLengthChange,
      },
      external: { audio },
    }),
    [
      canvas,
      draft,
      render,
      interaction,
      loopStateRef,
      dragMode,
      selected,
      loopState,
      loop,
      position,
      timeToX,
      pitchToY,
      xToTime,
      yToPitch,
      pxPerBeat,
      pxPerSemitone,
      keyWidth,
      topBarHeight,
      minPitch,
      maxPitch,
      grid,
      lengthBeats,
      trackId,
      snapBeat,
      clampMoveAvoidOverlap,
      clampResizeAvoidOverlap,
      getNotesForPitch,
      setSelected,
      setCursorStyle,
      setLoopState,
      draw,
      emitDraftThrottled,
      emitLoopChangeThrottled,
      onPositionChange,
      onLengthChange,
      audio,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const handler = createPointerMoveHandlerCtx(pointerMoveCtx);
      handler(e);
    },
    [pointerMoveCtx],
  );

  // ---------- pointerUp ----------
  const pointerUpCtx = useMemo<PointerUpHandlerCtx>(
    () => ({
      refs: {
        draft,
        interaction,
      },
      state: {
        dragMode,
        loopState,
      },
      clip: { trackId },
      callbacks: {
        setSelected,
        setDragMode,
        emitFrom,
        onLoopChange,
        invalidate,
      },
      external: { audio },
    }),
    [draft, interaction, dragMode, loopState, trackId, setSelected, setDragMode, emitFrom, onLoopChange, invalidate, audio],
  );

  const onPointerUp = useCallback(() => {
    const handler = createPointerUpHandlerCtx(pointerUpCtx);
    handler();
  }, [pointerUpCtx]);

  // ---------- doubleClick ----------
  const doubleClickCtx = useMemo<DoubleClickHandlerCtx>(
    () => ({
      refs: { canvas, draft },
      callbacks: { setSelected, emitFrom },
      coords: { timeToX, pitchToY, xToTime, yToPitch },
      ui: { pxPerSemitone, keyWidth, topBarHeight },
      state: { grid, loop: loop ?? null, loopState },
    }),
    [
      canvas,
      draft,
      setSelected,
      emitFrom,
      timeToX,
      pitchToY,
      xToTime,
      yToPitch,
      pxPerSemitone,
      keyWidth,
      topBarHeight,
      grid,
      loop,
      loopState,
    ],
  );

  const onDoubleClick = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const handler = createDoubleClickHandler(doubleClickCtx);
      handler(e);
    },
    [doubleClickCtx],
  );

  // ---------- keyDown (Delete / Backspace) ----------
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!onChange) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected.length > 0) {
          const sel = new Set(selected);
          const next = draft.current.filter((_n, i) => !sel.has(i));
          emitFrom(next);
          setSelected([]);
        }
      }
    },
    [onChange, selected, emitFrom, setSelected, draft],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onKeyDown,
  };
}
