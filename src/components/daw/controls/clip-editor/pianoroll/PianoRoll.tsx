// src/components/daw/controls/clip-editor/pianoroll/PianoRoll.tsx
"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { WheelEvent, KeyboardEvent } from "react";
import type { GridValue, MidiNote } from "@/lib/audio/types";
import { useAudioEngine } from "@/lib/audio/core/audio-engine";
import { MIN_PITCH, MAX_PITCH, KEY_WIDTH } from "./constants";
import type { DraftNote, PianoRollProps, DragMode, CursorType, PerfStats } from "./types";

// Hooks
import { useCoordinates } from "./hooks/useCoordinates";
import { useSnapGrid } from "./hooks/useSnapGrid";
import { useThrottle } from "./hooks/useThrottle";
import { useCanvasSetup } from "./hooks/useCanvasSetup";
import { useAutoFollow } from "./hooks/useAutoFollow";
import { useLoopState } from "./hooks/useLoopState";
import { useDrawScheduler } from "./hooks/useDrawScheduler";

// Rendering
import { drawBaseCanvas } from "./rendering/drawBase";
import { drawOverlayCanvas } from "./rendering/drawOverlay";
import type { RenderContext, DrawState } from "./rendering/renderContext";

// Interactions
import { createPointerDownHandler } from "./interactions/pointerHandlers";
import { createPointerMoveHandler } from "./interactions/pointerMoveHandler";

// Utils
import { clampMoveAvoidOverlap as utilClampMove, clampResizeAvoidOverlap as utilClampResize } from "./utils";

export const PianoRoll = memo(function PianoRoll({
  notes,
  lengthBeats = 4,
  onChange,
  onDraftChange,
  loop,
  onLoopChange,
  position,
  playheadBeat,
  active = false,
  followPlayhead = true,
  // contrôles optionnels
  grid: gridProp,
  snap: snapProp,
  pxPerBeat: pxPerBeatProp,
  onPxPerBeatChange,
}: PianoRollProps) {
  // ========== Canvas refs ==========
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawFnRef = useRef<(() => void) | null>(null);

  // ========== Audio engine ==========
  const audio = useAudioEngine();

  // ========== State refs ==========
  const pressedKeyRef = useRef<number | null>(null);
  const hoverPitchRef = useRef<number | null>(null);
  const hoverNoteRef = useRef<number | null>(null);
  const ghostRef = useRef<{ time: number; pitch: number } | null>(null);
  const playheadBeatRef = useRef<number | null>(null);
  const draftRef = useRef<DraftNote[]>([]);
  const pointerStart = useRef<{
    x: number;
    y: number;
    noteIndex: number | null;
    initial: DraftNote[];
    loopStart?: number;
    loopEnd?: number;
  } | null>(null);
  const rectangleSelectionRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragGuideRef = useRef<{ xCss: number; yCss: number; beat: number; pitch: number } | null>(null);
  const loopDragRef = useRef<{
    kind: "start" | "end" | "move";
    x0: number;
    initial: { start: number; end: number };
  } | null>(null);

  // ========== Device pixel ratio ==========
  const [dpr, setDpr] = useState<number>(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

  // ========== UI state ==========
  // controlled/uncontrolled: pxPerBeat
  const [internalPxPerBeat, setInternalPxPerBeat] = useState(64);
  const isPxPerBeatControlled = typeof pxPerBeatProp === "number";
  const pxPerBeat = isPxPerBeatControlled ? (pxPerBeatProp as number) : internalPxPerBeat;
  // setter handled inline in handlers to avoid unstable identity
  const [pxPerSemitone, setPxPerSemitone] = useState(14);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  // controlled/uncontrolled: snap
  const [internalSnap] = useState(true);
  const isSnapControlled = typeof snapProp === "boolean";
  const snap = isSnapControlled ? (snapProp as boolean) : internalSnap;
  // no local set required here (not mutated inside PianoRoll)

  // controlled/uncontrolled: grid
  const [internalGrid] = useState<GridValue>(16);
  const isGridControlled = typeof gridProp === "number";
  const grid = isGridControlled ? (gridProp as GridValue) : internalGrid;
  // no local set required here (not mutated inside PianoRoll)
  const [selected, setSelected] = useState<number[]>([]);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [cursor, setCursor] = useState<CursorType>("default");
  const { loopState, setLoopState, loopStateRef, emitLoopChangeThrottled: loopEmitThrottled } = useLoopState(
    loop,
    onLoopChange,
    active,
    80
  );

  // ========== Layout constants ==========
  const minPitch = MIN_PITCH;
  const maxPitch = MAX_PITCH;
  const keyWidth = KEY_WIDTH;
  const totalPxX = lengthBeats * pxPerBeat;
  const loopBarHeight = 12;
  const viewportHeightCssRef = useRef<number>(260);
  const didAutoCenterRef = useRef(false);
  // loopStateRef fourni par useLoopState

  // ========== Performance tracking ==========
  const perfRef = useRef<PerfStats>({
    lastDrawMs: 0,
    avgMs: 0,
    samples: 0,
    visible: 0,
    total: 0,
    lastUpdate: 0,
  });
  const culledBufferRef = useRef<DraftNote[]>([]);

  // ========== Custom hooks ==========
  const { timeToX, xToTime, pitchToY, yToPitch } = useCoordinates(
    keyWidth,
    pxPerBeat,
    pxPerSemitone,
    scrollX,
    scrollY,
    minPitch,
    maxPitch
  );

  const { snapBeat } = useSnapGrid(snap, grid);

  // ========== Sync props ==========
  useEffect(() => {
    draftRef.current = notes.map((n, i) => ({ ...n, __id: i }));
    if (drawFnRef.current) drawFnRef.current();
  }, [notes]);

  useEffect(() => {
    playheadBeatRef.current = typeof playheadBeat === "number" ? playheadBeat : null;
  }, [playheadBeat]);

  // Loop prop changes handled by useLoopState internally

  // ========== Update DPR on window resize ==========
  useEffect(() => {
    const onResize = () => {
      const next = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      if (next !== dpr) setDpr(next);
    };
    if (typeof window !== "undefined") window.addEventListener("resize", onResize);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
    };
  }, [dpr]);

  // ========== Clamp helpers ==========
  const clampMoveAvoidOverlap = useCallback(
    (idx: number, nextTime: number, duration: number, pitch: number, exclude: ReadonlySet<number>) => {
      return utilClampMove(idx, nextTime, duration, pitch, draftRef.current, exclude);
    },
    []
  );

  const clampResizeAvoidOverlap = useCallback(
    (idx: number, time: number, nextDuration: number, pitch: number, exclude: ReadonlySet<number>) => {
      return utilClampResize(idx, time, nextDuration, pitch, draftRef.current, grid, exclude);
    },
    [grid]
  );

  // ========== Stop preview ==========
  const stopAnyPreview = useCallback(() => {
    if (pressedKeyRef.current == null) return;
    const pitch = pressedKeyRef.current;
    try {
      audio.stopPreviewNote(pitch);
    } finally {
      pressedKeyRef.current = null;
    }
  }, [audio]);

  // ========== Draw functions ==========
  const drawBase = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = ctxRef.current;
    if (!cvs || !ctx) return;

    const renderCtx: RenderContext = {
      dpr,
      keyWidth,
      scrollX,
      scrollY,
      pxPerBeat,
      pxPerSemitone,
      minPitch,
      maxPitch,
      grid,
      loopBarHeight,
      lengthBeats,
      selected,
      draftNotes: draftRef.current,
      loop: loop ?? null,
      loopState,
      timeToX,
      xToTime,
      pitchToY,
      yToPitch,
    };

    const drawState: DrawState = {
      pressedPitch: pressedKeyRef.current,
      hoverPitch: hoverPitchRef.current,
      hoverNote: hoverNoteRef.current,
      ghost: ghostRef.current,
      rectangleSelection: rectangleSelectionRef.current,
      dragGuide: dragGuideRef.current,
      pointerStart: pointerStart.current,
    };

    const t0 = performance.now();
    const stats = drawBaseCanvas(ctx, cvs, draftRef.current, renderCtx, drawState, culledBufferRef.current);
    const t1 = performance.now();

    perfRef.current.lastDrawMs = t1 - t0;
    perfRef.current.visible = stats.visible;
    perfRef.current.total = stats.total;
  }, [
    dpr,
    keyWidth,
    scrollX,
    scrollY,
    pxPerBeat,
    pxPerSemitone,
    minPitch,
    maxPitch,
    grid,
    loopBarHeight,
    lengthBeats,
    selected,
    loop,
    loopState,
    timeToX,
    xToTime,
    pitchToY,
    yToPitch,
  ]);

  const drawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    drawOverlayCanvas(overlay, dpr, active, position, playheadBeat, playheadBeatRef.current, lengthBeats, timeToX);
  }, [active, dpr, playheadBeat, timeToX, lengthBeats, position]);

  const draw = useCallback(() => {
    drawBase();
    drawOverlay();
  }, [drawBase, drawOverlay]);

  useEffect(() => {
    drawFnRef.current = draw;
  }, [draw]);

  // ========== Redraw triggers ==========
  const invalidate = useDrawScheduler(drawFnRef);
  useEffect(() => {
    invalidate();
  }, [position, invalidate]);

  useEffect(() => {
    invalidate();
  }, [pxPerBeat, pxPerSemitone, scrollX, scrollY, selected, dragMode, invalidate]);

  // ========== MIDI conversion helper ==========
  const toMidi = useCallback(
    (arr: DraftNote[]): MidiNote[] =>
      arr.map((n) => ({
        id: (n as MidiNote).id ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        pitch: n.pitch,
        time: n.time,
        duration: n.duration,
        velocity: n.velocity ?? 0.8,
      })),
    []
  );

  // ========== Cleanup ==========
  useEffect(() => {
    return () => {
      stopAnyPreview();
    };
  }, [stopAnyPreview]);

  // ========== Throttled emitters ==========
  const emitDraftThrottled = useThrottle(
    () => {
      if (onDraftChange) onDraftChange(toMidi(draftRef.current));
    },
    80,
    active
  );

  // (supprimé) ancienne version emitLoopChangeThrottled remplacée par loopEmitThrottled du hook useLoopState

  // ========== Emit changes ==========
  const emitFrom = useCallback(
    (arr: DraftNote[]) => {
      draftRef.current = arr;
      invalidate();
      onChange?.(toMidi(arr));
    },
    [invalidate, onChange, toMidi]
  );

  // ========== Canvas setup ==========
  useCanvasSetup(canvasRef, overlayCanvasRef, wrapRef, ctxRef, dpr, draw, (width, height) => {
    viewportHeightCssRef.current = height;
    // Initial auto-center
    if (!didAutoCenterRef.current && notes.length > 0) {
      const viewport = height;
      const content = (maxPitch - minPitch + 1) * pxPerSemitone;
      const maxY = Math.max(0, content - viewport);
      const centerPitch =
        Math.min(
          maxPitch,
          Math.max(minPitch, (Math.min(...notes.map((n) => n.pitch)) + Math.max(...notes.map((n) => n.pitch))) / 2)
        ) || 60;
      const target = Math.min(maxY, Math.max(0, (maxPitch - centerPitch) * pxPerSemitone - viewport / 2));
      setScrollY(target);
      didAutoCenterRef.current = true;
    }
  });

  // ========== Auto-follow playhead ==========
  useAutoFollow(
    active,
    followPlayhead,
    playheadBeat,
    timeToX,
    keyWidth,
    totalPxX,
    scrollX,
    setScrollX,
    () => invalidate(),
    wrapRef
  );

  // ========== Event handlers ==========
  const onPointerDown = createPointerDownHandler(
    canvasRef,
    draftRef,
    selected,
    setSelected,
    setDragMode,
    pointerStart,
    rectangleSelectionRef,
    loopDragRef,
    pressedKeyRef,
    audio,
    timeToX,
    pitchToY,
    xToTime,
    yToPitch,
    snapBeat,
    pxPerSemitone,
    keyWidth,
    loopBarHeight,
    maxPitch,
    grid,
    lengthBeats,
    loop ?? null,
    loopState,
    draw,
    emitDraftThrottled
  );

  const onPointerMove = createPointerMoveHandler(
    canvasRef,
    draftRef,
    dragMode,
    selected,
    setSelected,
    setCursor,
    pointerStart,
    rectangleSelectionRef,
    loopDragRef,
    dragGuideRef,
    hoverNoteRef,
    hoverPitchRef,
    ghostRef,
    loopState,
    setLoopState,
    loopStateRef,
    timeToX,
    pitchToY,
    xToTime,
    yToPitch,
    snapBeat,
    clampMoveAvoidOverlap,
    clampResizeAvoidOverlap,
    pxPerBeat,
    pxPerSemitone,
    keyWidth,
    loopBarHeight,
    minPitch,
    maxPitch,
    grid,
    lengthBeats,
    loop ?? null,
    draw,
    emitDraftThrottled,
    loopEmitThrottled,
    pressedKeyRef,
    audio
  );

  const onPointerUp = useCallback(() => {
    stopAnyPreview();

    if (dragMode && pointerStart.current) {
      emitFrom(draftRef.current);
    }

    if ((dragMode === "loopStart" || dragMode === "loopEnd" || dragMode === "loopMove") && loopDragRef.current) {
      const next = loopState ? { ...loopState } : null;
      onLoopChange?.(next);
      loopDragRef.current = null;
    }

    pointerStart.current = null;
    rectangleSelectionRef.current = null;
    dragGuideRef.current = null;
    setDragMode(null);
    invalidate();
  }, [dragMode, emitFrom, stopAnyPreview, invalidate, loopState, onLoopChange]);

  const onWheel = useCallback(
    (e: WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY;

      // Vertical scroll
      if (!e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        setScrollY((prev) => {
          const viewport = viewportHeightCssRef.current ?? 0;
          const content = (maxPitch - minPitch + 1) * pxPerSemitone;
          const maxY = Math.max(0, content - viewport);
          let next = prev + Math.sign(delta) * 20;
          next = Math.max(0, Math.min(maxY, next));
          return next;
        });
        return;
      }

      // Horizontal scroll
      if (e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        setScrollX((prev) => {
          const maxX = Math.max(0, totalPxX - (wrapRef.current?.clientWidth ?? 640));
          let next = prev + delta * 0.5;
          next = Math.max(0, Math.min(maxX, next));
          return next;
        });
        return;
      }

      // Horizontal zoom
      if (e.ctrlKey || e.metaKey) {
        let next = pxPerBeat * (1 - delta * 0.001);
        next = Math.max(16, Math.min(192, next));
        if (isPxPerBeatControlled) {
          (onPxPerBeatChange ?? (() => {}))(next);
        } else {
          setInternalPxPerBeat(next);
        }
        return;
      }

      // Vertical zoom
      if (e.altKey) {
        setPxPerSemitone((prev) => {
          let next = prev * (1 - delta * 0.001);
          next = Math.max(6, Math.min(24, next));
          return next;
        });
      }
    },
    [
      maxPitch,
      minPitch,
      pxPerSemitone,
      totalPxX,
      pxPerBeat,
      isPxPerBeatControlled,
      onPxPerBeatChange,
      setInternalPxPerBeat,
    ]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!onChange) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected.length > 0) {
          const sel = new Set(selected);
          const next = draftRef.current.filter((_n, i) => !sel.has(i));
          emitFrom(next);
          setSelected([]);
        }
      }
    },
    [onChange, selected, emitFrom]
  );

  return (
    <div
      ref={wrapRef}
      className="w-full h-full relative bg-neutral-950"
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="application"
      aria-label="Piano roll editor"
      style={{ cursor }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />
      <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
});
