"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { buildNotesIndex, type NotesIndex } from "./core/notesIndex";
import { MIN_PITCH, MAX_PITCH, KEY_WIDTH } from "./core/constants";
import { usePianoRollViewport } from "./state/usePianoRollViewport";
import type { DraftNote, PianoRollProps, DragMode, CursorType, PerfStats, InteractionState } from "./types";

// Hooks
import { useCoordinates } from "./hooks/useCoordinates";
import { useSnapGrid } from "./hooks/useSnapGrid";
import { useCanvasSetup } from "./hooks/useCanvasSetup";
import { useAutoFollow } from "./hooks/useAutoFollow";
import { useLoopState } from "./state/useLoopState";
import { useDrawScheduler } from "./hooks/useDrawScheduler";
import { useControllableState } from "./state/useControllableState";

// Rendering
import type { OverlayContext, RenderContext } from "./rendering/renderContext";
import { usePianoRollDraw } from "./hooks/usePianoRollDraw";

// Interactions
import { usePianoRollHandlers } from "./interactions/usePianoRollHandlers";

// Utils
import {
  clampMoveAvoidOverlapIndexed,
  clampResizeAvoidOverlapIndexed,
  clampMoveAvoidOverlap as utilClampMove,
  clampResizeAvoidOverlap as utilClampResize,
} from "./core/utils";
import { useDevicePixelRatio } from "./state/useDevicePixelRatio";
import { useMidiEmitters } from "./hooks/useMidiEmitters";
import { useThrottle } from "./hooks/useThrottle";
import { useOverlayTicker } from "./hooks/useOverlayTicker";
import { useAudioEngine } from "@/core/audio-engine/core/audio-engine";
import { useTransportScheduler } from "@/core/audio-engine/core/transport-scheduler";
import { GridValue } from "@/core/audio-engine/types";

export const PianoRoll = memo(function PianoRoll({
  notes,                      // liste des notes (time, pitch, duration, velocity, etc.)
  lengthBeats = 4,            // longueur du clip en beats (par défaut 4)
  onChange,                   // callback quand les notes sont modifiées
  onDraftChange,              // callback pendant le drag / preview
  loop,                       // boucle { start, end } ou null
  onLoopChange,               // callback quand la boucle change  
  position,                   // position de départ du clip en beats (offset de lecture)
  onPositionChange,           // callback quand la position change
  onLengthChange,             // callback quand la longueur du clip change
  isPlaying = false,          // indique si le clip est en lecture
  followPlayhead = true,
  // contrôles optionnels
  grid: gridProp,
  snap: snapProp,
  pxPerBeat: pxPerBeatProp,
  onPxPerBeatChange,
  trackId,
}: PianoRollProps) {
  // ========== Canvas refs ==========
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawFnRef = useRef<(() => void) | null>(null);

  // ========== Audio & transport ==========
  const audio = useAudioEngine();
  const scheduler = useTransportScheduler();

  // ========== State refs ==========
  const interactionRef = useRef<InteractionState>({
    pressedKey: null,
    hoverPitch: null,
    hoverNote: null,
    ghost: null,
    pointerStart: null,
    rectangleSelection: null,
    dragGuide: null,
    loopDrag: null,
    selected: [],
    dragMode: null,
    cursor: "default",
    canvasRectCache: null
  });

  const draftRef = useRef<DraftNote[]>([]);
  const notesIndexRef = useRef<NotesIndex | null>(null);

  // Render contexts (pour le draw)
  const renderCtxRef = useRef<RenderContext>({
    dpr: 1,
    keyWidth: KEY_WIDTH,
    scrollX: 0,
    scrollY: 0,
    pxPerBeat: 128,
    pxPerSemitone: 14,
    minPitch: MIN_PITCH,
    maxPitch: MAX_PITCH,
    grid: 16,
    topBarHeight: 36,
    lengthBeats: lengthBeats,
    positionStart: position || 0,
    selected: [],
    selectedSet: new Set<number>() as ReadonlySet<number>,
    draftNotes: [],
    loop: null,
    loopState: null,
    timeToX: () => 0,
    xToTime: () => 0,
    pitchToY: () => 0,
    yToPitch: () => 0,
  });

  const overlayCtxRef = useRef<OverlayContext>({
    dpr: 1,
    active: isPlaying,
    position,
    playheadBeat: undefined,
    lengthBeats,
    timeToX: () => 0,
    lastPlayhead: null,
  });

  // ========== Device pixel ratio ==========
  const dpr = useDevicePixelRatio();

  // ========== UI state ==========
  const [controlledPxPerBeat, setPxPerBeat] = useControllableState<number>({
    value: pxPerBeatProp,
    defaultValue: 64,
    onChange: onPxPerBeatChange,
  });
  const [pxPerSemitone, setPxPerSemitone] = useState(14);

  const minPitch = MIN_PITCH;
  const maxPitch = MAX_PITCH;
  const keyWidth = KEY_WIDTH;

  const [snap] = useControllableState<boolean>({
    value: snapProp,
    defaultValue: true,
  });
  const [grid] = useControllableState<GridValue>({
    value: gridProp,
    defaultValue: 16,
  });

  const viewport = usePianoRollViewport({
    minPitch,
    maxPitch,
    lengthBeats,
    keyWidth,
    pxPerBeat: controlledPxPerBeat,
    setPxPerBeat,
    pxPerSemitone,
    setPxPerSemitone: (fn) => setPxPerSemitone((prev) => fn(prev)),
    wrapRef,
  });

  const { scrollX, scrollY, pxPerBeat, setScrollX, setScrollY } = viewport;

  const [selected, setSelected] = useState<number[]>([]);
  const [dragMode, setDragMode] = useState<DragMode>(null);

  // Cursor: style DOM direct
  const setCursorStyle = useThrottle<string>(
    (v) => {
      interactionRef.current.cursor = v as CursorType;
      const el = wrapRef.current;
      if (el) el.style.cursor = v;
    },
    16,
    true
  );

  const {
    loopState,
    setLoopState,
    loopStateRef,
    emitLoopChangeThrottled: loopEmitThrottled,
  } = useLoopState(loop, onLoopChange, isPlaying, 80);

  const totalPxX = lengthBeats * pxPerBeat;
  const topBarHeight = 36;
  const viewportHeightCssRef = useRef<number>(260);
  const didAutoCenterRef = useRef(false);

  // ========== Perf tracking ==========
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

  // ========== Helpers : playhead clip-local ==========
  const getClipPlayheadBeat = useCallback(() => {
    if (!isPlaying) return null;

    const globalBeat = scheduler.getBeatFloat();
    if (!Number.isFinite(globalBeat)) return null;

    const ls = loop?.start ?? 0;
    const leUnsafe = loop?.end ?? lengthBeats;
    const le = Math.max(leUnsafe, ls + 1e-6);
    const loopLen = le - ls;

    const pos = typeof position === "number" && Number.isFinite(position) ? position : ls;

    const relative = globalBeat + (pos - ls);
    const phase = ((relative % loopLen) + loopLen) % loopLen;
    return ls + phase;
  }, [isPlaying, scheduler, loop, lengthBeats, position]);

  // ========== Sync notes ==========
  useEffect(() => {
    draftRef.current = notes.map((n, i) => ({ ...n, __id: i }));
    notesIndexRef.current = buildNotesIndex(draftRef.current);
    if (drawFnRef.current) drawFnRef.current();
  }, [notes]);

  const getNotesForPitch = useCallback((pitch: number) => {
    const idx = notesIndexRef.current;
    if (!idx) return [];
    const arr = idx.byPitch.get(pitch);
    return arr ?? [];
  }, []);

  // ========== Clamp helpers ==========
  const clampMoveAvoidOverlap = useCallback(
    (idx: number, nextTime: number, duration: number, pitch: number, exclude: ReadonlySet<number>) => {
      const index = notesIndexRef.current;
      if (!index) {
        // fallback: version naïve
        return utilClampMove(idx, nextTime, duration, pitch, draftRef.current, exclude);
      }
      return clampMoveAvoidOverlapIndexed(idx, nextTime, duration, pitch, draftRef.current, index, exclude);
    },
    []
  );

  const clampResizeAvoidOverlap = useCallback(
    (idx: number, time: number, nextDuration: number, pitch: number, exclude: ReadonlySet<number>) => {
      const index = notesIndexRef.current;
      if (!index) {
        return utilClampResize(idx, time, nextDuration, pitch, draftRef.current, grid, exclude);
      }
      return clampResizeAvoidOverlapIndexed(idx, time, nextDuration, pitch, grid, draftRef.current, index, exclude);
    },
    [grid]
  );

  // ========== Draw ==========
  const { draw, drawOverlay } = usePianoRollDraw({
    canvasRef,
    overlayCanvasRef,
    ctxRef,
    interactionRef,
    renderCtxRef,
    overlayCtxRef,
    culledBufferRef,
    perfRef,
    drawFnRef,
  });

  // Wrap d'overlay : met à jour le playhead avant de dessiner
  const drawOverlayWithPlayhead = useCallback(() => {
    const ph = getClipPlayheadBeat();
    const overlay = overlayCtxRef.current;
    overlay.playheadBeat = ph === null ? undefined : ph;
    overlay.lastPlayhead = ph;
    drawOverlay();
  }, [getClipPlayheadBeat, drawOverlay]);

  // Overlay ticker (60 fps) pendant la lecture
  useOverlayTicker(isPlaying, drawOverlayWithPlayhead, 60);

  // ========== Render context ==========
  useEffect(() => {
    renderCtxRef.current = {
      ...renderCtxRef.current,
      dpr,
      keyWidth,
      scrollX,
      scrollY,
      pxPerBeat,
      pxPerSemitone,
      minPitch,
      maxPitch,
      grid,
      topBarHeight,
      lengthBeats,
      positionStart: position || 0,
      selected,
      selectedSet: new Set(selected),
      draftNotes: draftRef.current,
      loop: loop ?? null,
      loopState,
      timeToX,
      xToTime,
      pitchToY,
      yToPitch,
    };

    const overlay = overlayCtxRef.current;
    overlay.dpr = dpr;
    overlay.active = isPlaying;
    overlay.position = position;
    overlay.lengthBeats = lengthBeats;
    overlay.timeToX = timeToX;
  }, [dpr, keyWidth, scrollX, scrollY, pxPerBeat, pxPerSemitone, minPitch, maxPitch, grid, lengthBeats, position, selected, loop, loopState, timeToX, xToTime, pitchToY, yToPitch, isPlaying]);

  // ========== Draw scheduler ==========
  const invalidate = useDrawScheduler(drawFnRef);

  useEffect(() => {
    invalidate();
  }, [invalidate, position, pxPerBeat, pxPerSemitone, scrollX, scrollY, selected, dragMode, loop, loopState]);

  // ========== Sync interaction state ==========
  useEffect(() => {
    interactionRef.current.selected = selected;
  }, [selected]);

  useEffect(() => {
    interactionRef.current.dragMode = dragMode;
  }, [dragMode]);

  // ========== Emission des notes ==========
  const { emitDraftThrottled, emitFrom } = useMidiEmitters({
    active: isPlaying,
    onDraftChange,
    onChange,
    draftRef,
    invalidate,
    throttleMs: 80,
  });

  // ========== Canvas setup ==========
  useCanvasSetup(canvasRef, overlayCanvasRef, wrapRef, ctxRef, dpr, draw, (width, height) => {
    viewportHeightCssRef.current = height;
    if (!didAutoCenterRef.current && notes.length > 0) {
      const viewportH = height;
      const content = (maxPitch - minPitch + 1) * pxPerSemitone;
      const maxY = Math.max(0, content - viewportH);
      const pitches = notes.map((n) => n.pitch);
      const minN = Math.min(...pitches);
      const maxN = Math.max(...pitches);
      const centerPitch = Math.min(maxPitch, Math.max(minPitch, (minN + maxN) / 2)) || 60;
      const target = Math.min(maxY, Math.max(0, (maxPitch - centerPitch) * pxPerSemitone - viewportH / 2));
      setScrollY(target);
      didAutoCenterRef.current = true;
    }
  });

  // ========== Auto-follow (sans React pour le playhead) ==========
  useAutoFollow(
    isPlaying,
    followPlayhead,
    getClipPlayheadBeat,
    timeToX,
    keyWidth,
    totalPxX,
    scrollX,
    setScrollX,
    () => invalidate(),
    wrapRef
  );

  // ========== Event handlers ==========
  const { onPointerDown, onPointerMove, onPointerUp, onDoubleClick, onKeyDown } = usePianoRollHandlers({
    refs: {
      canvas: canvasRef,
      overlayCanvas: overlayCanvasRef, // même si pas utilisé dans le hook pour l’instant
      draft: draftRef,
      interaction: interactionRef,
      render: renderCtxRef,
      loopState: loopStateRef,
    },
    state: {
      selected,
      setSelected,
      dragMode,
      setDragMode,
      loop: loop ?? null,
      loopState,
      lengthBeats,
      position,
    },
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
      emitLoopChangeThrottled: loopEmitThrottled,
      onPositionChange,
      onLengthChange,
      onLoopChange,
      onChange,
      setLoopState,
    },
    misc: {
      invalidate,
      setCursorStyle,
      audio,
    },
  });

  return (
    <div
      ref={wrapRef}
      className="w-full h-full relative bg-neutral-950"
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="application"
      aria-label="Piano roll editor"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
      <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
});
