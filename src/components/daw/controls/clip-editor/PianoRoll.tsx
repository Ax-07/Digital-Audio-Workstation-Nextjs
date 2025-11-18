// src/components/daw/controls/clip-editor/PianoRoll.tsx
"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, WheelEvent, KeyboardEvent } from "react";
import type { MidiNote } from "@/lib/audio/types";
import { useAudioEngine } from "@/lib/audio/core/audio-engine";
import { MIN_PITCH, MAX_PITCH, KEY_WIDTH } from "./constants";
import * as coords from "./coords";
import { getHitAt, type DraftNote } from "./hit";
import { drawKeyboard } from "./draw/drawKeyboard";
import { drawGrid } from "./draw/drawGrid";
import { drawNotes } from "./draw/drawNotes";
import { clampMoveAvoidOverlap as utilClampMove, clampResizeAvoidOverlap as utilClampResize } from "./utils";

export type PianoRollProps = {
  notes: ReadonlyArray<MidiNote>;
  lengthBeats?: number;
  onChange?: (notes: MidiNote[]) => void;
  onDraftChange?: (notes: MidiNote[]) => void;
  loop?: { start: number; end: number } | null;
  onLoopChange?: (loop: { start: number; end: number } | null) => void;
  position?: number; // en beats, offset de lecture
  playheadBeat?: number;
  followPlayhead?: boolean;
  active?: boolean;
};

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
}: PianoRollProps) {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawFnRef = useRef<(() => void) | null>(null);

  // Audio engine
  const audio = useAudioEngine();
  // Preview & interaction state
  const pressedKeyRef = useRef<number | null>(null);
  const hoverPitchRef = useRef<number | null>(null);
  const hoverNoteRef = useRef<number | null>(null);
  const ghostRef = useRef<{ time: number; pitch: number } | null>(null);
  const playheadBeatRef = useRef<number | null>(null);
  const rafPendingRef = useRef(false);

  // Device pixel ratio for high-DPI displays (dynamic)
  const [dpr, setDpr] = useState<number>(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

  // UI state
  const [pxPerBeat, setPxPerBeat] = useState(64);
  const [pxPerSemitone, setPxPerSemitone] = useState(14);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [snap] = useState(true);
  // const [snapEdges, setSnapEdges] = useState(true); // reserved for future edge snapping
  const [grid] = useState<4 | 8 | 16 | 32>(16);
  const [selected, setSelected] = useState<number[]>([]);
  const [dragMode, setDragMode] = useState<
    | null
    | "move"
    | "resize"
    | "marquee"
    | "loopStart"
    | "loopEnd"
    | "loopMove"
  >(null);
  const [cursor, setCursor] = useState<"default" | "pointer" | "ew-resize" | "crosshair">("default");

  // Draft notes with unique IDs
  const draftRef = useRef<DraftNote[]>([]);

  // Drag state
  const pointerStart = useRef<{
    x: number;
    y: number;
    noteIndex: number | null;
    initial: DraftNote[];
    loopStart?: number;
    loopEnd?: number;
  } | null>(null);

  // Marquee selection
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Drag guides
  const dragGuideRef = useRef<{ xCss: number; yCss: number; beat: number; pitch: number } | null>(null);

  // Loop drag state
  const loopDragRef = useRef<{
    kind: "start" | "end" | "move";
    x0: number;
    initial: { start: number; end: number };
  } | null>(null);

  // Layout constants
  const minPitch = MIN_PITCH;
  const maxPitch = MAX_PITCH;
  const keyWidth = KEY_WIDTH;
  const totalPxX = lengthBeats * pxPerBeat;
  const viewportHeightCssRef = useRef<number>(260);
  const didAutoCenterRef = useRef(false);

  // Loop state (editable if onLoopChange is provided)
  const [loopState, setLoopState] = useState<{ start: number; end: number } | null>(loop ?? null);
  const loopBarHeight = 12;
  // Ref pour toujours accéder à la dernière valeur pendant les throttles
  const loopStateRef = useRef<{ start: number; end: number } | null>(loop ?? null);

  // Keep loopState in sync with parent loop prop
  useEffect(() => {
    setLoopState(loop ?? null);
    loopStateRef.current = loop ?? null;
  }, [loop]);

  // Performance tracking
  const perfRef = useRef<{
    lastDrawMs: number;
    avgMs: number;
    samples: number;
    visible: number;
    total: number;
    lastUpdate: number;
  }>({
    lastDrawMs: 0,
    avgMs: 0,
    samples: 0,
    visible: 0,
    total: 0,
    lastUpdate: 0,
  });
  const culledBufferRef = useRef<DraftNote[]>([]);

  // Sync props.notes -> draft (always trigger redraw)
  useEffect(() => {
    draftRef.current = notes.map((n, i) => ({ ...n, __id: i }));
    if (drawFnRef.current) drawFnRef.current();
  }, [notes]);

  // Keep playhead fallback ref in sync
  useEffect(() => {
    playheadBeatRef.current = typeof playheadBeat === "number" ? playheadBeat : null;
  }, [playheadBeat]);

  // Update DPR when window/devicePixelRatio changes
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

  // Coordinate helpers
  const timeToX = useCallback(
    (beat: number) => coords.timeToX(beat, pxPerBeat, scrollX, keyWidth),
    [keyWidth, pxPerBeat, scrollX]
  );
  const xToTime = useCallback(
    (xCss: number) => coords.xToTime(xCss, pxPerBeat, scrollX, keyWidth),
    [keyWidth, pxPerBeat, scrollX]
  );
  const pitchToY = useCallback(
    (pitch: number) => coords.pitchToY(pitch, maxPitch, pxPerSemitone, scrollY),
    [maxPitch, pxPerSemitone, scrollY]
  );
  const yToPitch = useCallback(
    (yCss: number) => coords.yToPitch(yCss, minPitch, maxPitch, pxPerSemitone, scrollY),
    [maxPitch, minPitch, pxPerSemitone, scrollY]
  );

  // Snap helper
  const snapBeat = useCallback(
    (beat: number) => {
      if (!snap) return beat;
      const step = 1 / grid;
      return Math.round(beat / step) * step;
    },
    [snap, grid]
  );

  // (Reserved) Snap to note edges — disabled for now to avoid extra work in rAF
  // const snapToNoteEdges = useCallback(
  //   (beat: number, pitch: number, exclude: ReadonlySet<number> | null) => {
  //     return utilSnapToNoteEdges(beat, pitch, draftRef.current, grid, snap && snapEdges, exclude);
  //   },
  //   [grid, snap, snapEdges]
  // );

  // Clamp helpers
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

  // Stop any preview note
  const stopAnyPreview = useCallback(() => {
    if (pressedKeyRef.current == null) return;
    const pitch = pressedKeyRef.current;
    try {
      audio.stopPreviewNote(pitch);
    } finally {
      pressedKeyRef.current = null;
    }
  }, [audio]);

  // DRAW BASE CANVAS (main static content)
  const drawBase = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = ctxRef.current;
    if (!cvs || !ctx) return;

    const W = cvs.width;
    const H = cvs.height;
    const wCss = W / dpr;
    const hCss = H / dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, wCss, hCss);

    // Keyboard gutter
    drawKeyboard(ctx, {
      wCss,
      hCss,
      keyWidth,
      scrollY,
      pxPerSemitone,
      minPitch,
      maxPitch,
      pitchToY,
      pressedPitch: pressedKeyRef.current,
      hoverPitch: hoverPitchRef.current,
    });

    // Grid + notes area
    ctx.save();
    ctx.translate(keyWidth, 0);

    drawGrid(ctx, { wCss, hCss, keyWidth, scrollX, pxPerBeat, grid, timeToX });

    // Loop shading (top band)
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, wCss - keyWidth, loopBarHeight);
    ctx.strokeStyle = "#404040";
    ctx.beginPath();
    ctx.moveTo(0, loopBarHeight + 0.5);
    ctx.lineTo(wCss - keyWidth, loopBarHeight + 0.5);
    ctx.stroke();

    // Important: prefer internal loopState so dragging updates render immediately
    const activeLoop = loopState ?? loop;
    if (activeLoop && activeLoop.end > activeLoop.start) {
      const lx0 = timeToX(activeLoop.start) - keyWidth;
      const lx1 = timeToX(activeLoop.end) - keyWidth;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(lx0, 0, lx1 - lx0, hCss);
      // Loop handles
      ctx.fillStyle = "#FFD02F";
      ctx.fillRect(lx0 - 2, 0, 4, loopBarHeight);
      ctx.fillRect(lx1 - 2, 0, 4, loopBarHeight);
      ctx.fillStyle = "rgba(255,208,47,0.12)";
      ctx.fillRect(lx0, 0, Math.max(0, lx1 - lx0), loopBarHeight);
    }

    // Viewport culling for performance: only draw visible notes
    const x0Beat = Math.max(0, xToTime(keyWidth));
    const x1Beat = xToTime(wCss);
    const y0Pitch = yToPitch(0);
    const y1Pitch = yToPitch(hCss);

    const t0 = performance.now();
    const culled = culledBufferRef.current;
    culled.length = 0; // Reuse buffer
    for (let i = 0; i < draftRef.current.length; i++) {
      const n = draftRef.current[i]!;
      const nEnd = n.time + n.duration;
      if (nEnd < x0Beat || n.time > x1Beat) continue;
      if (n.pitch < y1Pitch || n.pitch > y0Pitch) continue;
      culled.push(n);
    }

    drawNotes(ctx, {
      notes: culled,
      selectedIndices: selected,
      hoverIndex: hoverNoteRef.current,
      keyWidth,
      timeToX,
      pitchToY,
      pxPerBeat,
      pxPerSemitone,
    });

    // Position bar is drawn in overlay only

    const t1 = performance.now();
    perfRef.current.lastDrawMs = t1 - t0;
    perfRef.current.visible = culled.length;
    perfRef.current.total = draftRef.current.length;

    // Ghost note preview (when hovering without drag)
    if (!pointerStart.current && ghostRef.current) {
      const g = ghostRef.current;
      const gx = timeToX(g.time);
      const gy = pitchToY(g.pitch);
      const gw = pxPerBeat / grid;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#7aa2ff";
      ctx.fillRect(gx - keyWidth, gy + 2, Math.max(8, gw - 2), Math.max(4, pxPerSemitone - 4));
      ctx.globalAlpha = 1;
    }

    // Marquee selection overlay
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      const rx = Math.min(m.x0, m.x1) - keyWidth;
      const ry = Math.min(m.y0, m.y1);
      const rw = Math.abs(m.x1 - m.x0);
      const rh = Math.abs(m.y1 - m.y0);
      ctx.fillStyle = "rgba(255,208,47,0.1)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "rgba(255,208,47,0.6)";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(0, rw - 1), Math.max(0, rh - 1));
      ctx.setLineDash([]);
    }

    // Drag guides (time + pitch lines)
    if (dragGuideRef.current) {
      const g = dragGuideRef.current;
      const vx = g.xCss - keyWidth + 0.5;
      const hy = g.yCss + 0.5;
      ctx.save();
      ctx.strokeStyle = "rgba(255,208,47,0.4)";
      ctx.setLineDash([4, 4]);
      // Vertical (time)
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx, hCss);
      ctx.stroke();
      // Horizontal (pitch)
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(wCss - keyWidth, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      // Labels
      ctx.fillStyle = "#FFD02F";
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      const lblTime = g.beat.toFixed(3);
      const lblPitch = String(g.pitch);
      ctx.fillText(lblTime, Math.max(0, Math.min(wCss - keyWidth - 40, vx + 6)), Math.max(10, hy - 6));
      ctx.fillText(lblPitch, Math.max(0, Math.min(wCss - keyWidth - 30, vx + 6)), Math.min(hCss - 2, hy + 12));
      ctx.restore();
    }

    ctx.restore();
  }, [
    dpr,
    keyWidth,
    scrollY,
    pxPerSemitone,
    minPitch,
    maxPitch,
    pitchToY,
    scrollX,
    pxPerBeat,
    grid,
    timeToX,
    loop,
    loopState,
    xToTime,
    yToPitch,
    selected,
  ]);

  // DRAW OVERLAY (playhead, dynamic elements)
  const drawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    const W = overlay.width;
    const H = overlay.height;
    const hCss = H / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr, dpr);

    // Position (startOffset) - trait vert, toujours visible
    if (typeof position === "number") {
      const clampedPos = Math.max(0, Math.min(lengthBeats, position));
      const xPos = timeToX(clampedPos) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(60, 255, 60, 0.9)";
      ctx.lineWidth = 2;
      ctx.moveTo(xPos, 0);
      ctx.lineTo(xPos, hCss);
      ctx.stroke();
    }

    // Playhead (suivi de lecture) - trait bleu, seulement si actif
    const phBeat = active ? (typeof playheadBeat === "number" ? playheadBeat : playheadBeatRef.current) : null;
    if (active && typeof phBeat === "number") {
      const clampedBeat = Math.max(0, Math.min(lengthBeats, phBeat));
      const xPlay = timeToX(clampedBeat) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(96, 165, 250, 0.95)";
      ctx.lineWidth = 2;
      ctx.moveTo(xPlay, 0);
      ctx.lineTo(xPlay, hCss);
      ctx.stroke();
    }
  }, [active, dpr, playheadBeat, timeToX, lengthBeats, position]);

  // Combined draw function
  const draw = useCallback(() => {
    drawBase();
    drawOverlay();
  }, [drawBase, drawOverlay]);

  // Assign latest draw to ref
  useEffect(() => {
    drawFnRef.current = draw;
  }, [draw]);

  // Redraw overlay when position changes to keep the green bar visible instantly
  useEffect(() => {
    if (drawFnRef.current) drawFnRef.current();
  }, [position]);

  // Redraw on scroll/zoom/selection/drag mode changes
  useEffect(() => {
    if (drawFnRef.current) drawFnRef.current();
  }, [pxPerBeat, pxPerSemitone, scrollX, scrollY, selected, dragMode]);

  // Helper to convert draft notes to MIDI
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

  // Cleanup stuck preview note on unmount
  useEffect(() => {
    return () => {
      stopAnyPreview();
    };
  }, [stopAnyPreview]);

  // Throttle pour l'émission des brouillons pendant un drag
  const draftThrottleRef = useRef<number | null>(null);
  const pendingDraftRef = useRef<boolean>(false);
  const emitDraftThrottled = useCallback(() => {
    if (!onDraftChange || !active) return;
    if (draftThrottleRef.current != null) {
      pendingDraftRef.current = true;
      return;
    }
    onDraftChange(toMidi(draftRef.current));
    pendingDraftRef.current = false;
    draftThrottleRef.current = window.setTimeout(() => {
      draftThrottleRef.current = null;
      if (pendingDraftRef.current) {
        pendingDraftRef.current = false;
        onDraftChange(toMidi(draftRef.current));
      }
    }, 80);
  }, [onDraftChange, active, toMidi]);

  useEffect(() => {
    return () => {
      if (draftThrottleRef.current != null) {
        window.clearTimeout(draftThrottleRef.current);
        draftThrottleRef.current = null;
      }
    };
  }, []);

  // Throttle pour l'émission des changements de loop pendant un drag
  const loopDraftThrottleRef = useRef<number | null>(null);
  const loopPendingDraftRef = useRef<boolean>(false);
  const emitLoopChangeThrottled = useCallback(() => {
    if (!onLoopChange || !active) return;
    if (loopDraftThrottleRef.current != null) {
      loopPendingDraftRef.current = true;
      return;
    }
    onLoopChange(loopStateRef.current ? { ...loopStateRef.current } : null);
    loopPendingDraftRef.current = false;
    loopDraftThrottleRef.current = window.setTimeout(() => {
      loopDraftThrottleRef.current = null;
      if (loopPendingDraftRef.current) {
        loopPendingDraftRef.current = false;
        onLoopChange(loopStateRef.current ? { ...loopStateRef.current } : null);
      }
    }, 80);
  }, [onLoopChange, active]);

  useEffect(() => {
    return () => {
      if (loopDraftThrottleRef.current != null) {
        window.clearTimeout(loopDraftThrottleRef.current);
        loopDraftThrottleRef.current = null;
      }
    };
  }, []);

  // Emit changes to parent
  const emitFrom = useCallback(
    (arr: DraftNote[]) => {
      draftRef.current = arr;
      draw();
      onChange?.(toMidi(arr));
    },
    [draw, onChange, toMidi]
  );

  // Setup canvas + ResizeObserver
  useEffect(() => {
    const cvs = canvasRef.current;
    const parent = wrapRef.current;
    if (!cvs || !parent) return;

    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;
    const overlay = overlayCanvasRef.current;

    const sizeCanvas = () => {
      const rect = parent.getBoundingClientRect();
      const wCss = rect.width || parent.clientWidth || 640;
      const hCss = rect.height || parent.clientHeight || 260;
      const w = Math.max(1, Math.floor(wCss));
      const h = Math.max(120, Math.floor(hCss));

      cvs.width = Math.floor(w * dpr);
      cvs.height = Math.floor(h * dpr);
      cvs.style.width = `${w}px`;
      cvs.style.height = `${h}px`;

      if (overlay) {
        overlay.width = Math.floor(w * dpr);
        overlay.height = Math.floor(h * dpr);
        overlay.style.width = `${w}px`;
        overlay.style.height = `${h}px`;
      }

      viewportHeightCssRef.current = h;
      draw();

      // Initial auto-center on first sizing
      if (!didAutoCenterRef.current && notes.length > 0) {
        const viewport = viewportHeightCssRef.current ?? 0;
        const content = (maxPitch - minPitch + 1) * pxPerSemitone;
        const maxY = Math.max(0, content - viewport);
        const centerPitch =
          Math.min(
            maxPitch,
            Math.max(minPitch, (Math.min(...notes.map((n) => n.pitch)) + Math.max(...notes.map((n) => n.pitch))) / 2)
          ) || 60; // C4 default
        const target = Math.min(maxY, Math.max(0, (maxPitch - centerPitch) * pxPerSemitone - viewport / 2));
        setScrollY(target);
        didAutoCenterRef.current = true;
      }
    };

    sizeCanvas();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sizeCanvas);
      ro.observe(parent);
    }

    return () => {
      ro?.disconnect();
    };
  }, [dpr, draw, maxPitch, minPitch, notes, pxPerSemitone]);

  // Auto-follow playhead horizontally
  useEffect(() => {
    if (!active || !followPlayhead) return;
    if (typeof playheadBeat !== "number") return;

    if (!rafPendingRef.current) {
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        const wrap = wrapRef.current;
        if (wrap && typeof playheadBeat === "number") {
          const px = timeToX(playheadBeat) - keyWidth;
          const margin = 24;
          const viewW = wrap.clientWidth;

          if (px > viewW - margin) {
            const target = Math.min(totalPxX - viewW, scrollX + (px - (viewW - margin)));
            if (!Number.isNaN(target) && Number.isFinite(target)) setScrollX(Math.max(0, target));
          } else if (px < margin) {
            const target = Math.max(0, scrollX + (px - margin));
            if (!Number.isNaN(target) && Number.isFinite(target)) setScrollX(Math.max(0, target));
          }
        }
        draw();
      });
    }
  }, [active, followPlayhead, playheadBeat, timeToX, keyWidth, totalPxX, scrollX, draw]);

  // POINTER DOWN
  const onPointerDown = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
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

      // Keyboard preview
      if (hit.type === "keyboard" && typeof hit.pitch === "number") {
        const pitch = maxPitch - hit.pitch;
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
        pointerStart.current = {
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
        pointerStart.current = {
          x: xCss,
          y: yCss,
          noteIndex: idx,
          initial: draftRef.current.slice(),
        };
        return;
      }

      // Create new note
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
        pointerStart.current = {
          x: xCss,
          y: yCss,
          noteIndex: newIdx,
          initial: next.slice(),
        };
        draw();
        emitDraftThrottled();
        return;
      }

      // Loop handles drag start (placed before marquee handling for reliability)
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

      // Loop move (drag the whole loop zone keeping duration)
      if (hit.type === "loopBar") {
        const current = loop ?? loopState;
        if (current) {
          const xStart = timeToX(current.start);
          const xEnd = timeToX(current.end);
          // inside loop zone and within the loop bar height
          if (xCss >= xStart && xCss <= xEnd && yCss <= loopBarHeight) {
            loopDragRef.current = { kind: "move", x0: xCss, initial: { ...current } };
            setDragMode("loopMove");
            return;
          }
        }
      }

      // Start marquee selection
      if (hit.type === "empty" || hit.type === "loopBar") {
        marqueeRef.current = { x0: xCss, y0: yCss, x1: xCss, y1: yCss };
        setDragMode("marquee");
        draw();
      }
    },
    [
      timeToX,
      pitchToY,
      pxPerSemitone,
      keyWidth,
      loopBarHeight,
      loop,
      loopState,
      selected,
      maxPitch,
      audio,
      draw,
      snapBeat,
      xToTime,
      yToPitch,
      grid,
      lengthBeats,
      emitDraftThrottled,
    ]
  );

  // POINTER MOVE
  const onPointerMove = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
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
          // Show resize cursor when hovering loop handles
          setCursor("ew-resize");
        } else if (hit.type === "keyboard") {
          hoverPitchRef.current = hit.pitch ?? null;
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
      if (dragMode === "move" && pointerStart.current && typeof pointerStart.current.noteIndex === "number") {
        const dx = xCss - pointerStart.current.x;
        const dy = yCss - pointerStart.current.y;
        const dBeat = dx / pxPerBeat;
        const dPitch = -Math.round(dy / pxPerSemitone);

        const sel = new Set(selected);
        const next = pointerStart.current.initial.slice();

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
        const primary = next[pointerStart.current.noteIndex];
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
      if (dragMode === "resize" && pointerStart.current && typeof pointerStart.current.noteIndex === "number") {
        const dx = xCss - pointerStart.current.x;
        const dBeat = dx / pxPerBeat;

        const sel = new Set(selected);
        const next = pointerStart.current.initial.slice();

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

      // Marquee selection
      if (dragMode === "marquee" && marqueeRef.current) {
        marqueeRef.current.x1 = xCss;
        marqueeRef.current.y1 = yCss;

        const m = marqueeRef.current;
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

      // Loop move dragging (preserve duration)
      if (dragMode === "loopMove" && loopDragRef.current) {
        const dx = xCss - loopDragRef.current.x0;
        const dBeat = dx / pxPerBeat;
        const { start, end } = loopDragRef.current.initial;
        const duration = Math.max(0, end - start);
        let nextStart = e.shiftKey ? start + dBeat : snapBeat(start + dBeat);
        // Clamp so the loop stays within [0, lengthBeats]
        nextStart = Math.max(0, Math.min(lengthBeats - duration, nextStart));
        const nextEnd = nextStart + duration;
        const nextLoop = { start: nextStart, end: nextEnd } as const;
        loopStateRef.current = nextLoop;
        setLoopState(nextLoop);
        emitLoopChangeThrottled();
        draw();
        return;
      }
    },
    [
      dragMode,
      timeToX,
      pitchToY,
      pxPerSemitone,
      keyWidth,
      loopBarHeight,
      loop,
      loopState,
      selected,
      xToTime,
      yToPitch,
      snapBeat,
      draw,
      pxPerBeat,
      minPitch,
      maxPitch,
      clampMoveAvoidOverlap,
      grid,
      clampResizeAvoidOverlap,
      lengthBeats,
      emitDraftThrottled,
      emitLoopChangeThrottled,
    ]
  );

  // POINTER UP
  const onPointerUp = useCallback(() => {
    stopAnyPreview();

    if (dragMode && pointerStart.current) {
      emitFrom(draftRef.current);
    }

    // Commit loop changes
    if ((dragMode === "loopStart" || dragMode === "loopEnd" || dragMode === "loopMove") && loopDragRef.current) {
      const next = loopState ? { ...loopState } : null;
      onLoopChange?.(next);
      loopDragRef.current = null;
    }

    pointerStart.current = null;
    marqueeRef.current = null;
    dragGuideRef.current = null;
    setDragMode(null);
    draw();
  }, [dragMode, emitFrom, stopAnyPreview, draw, loopState, onLoopChange]);

  // WHEEL (scroll + zoom)
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
        setPxPerBeat((prev) => {
          let next = prev * (1 - delta * 0.001);
          next = Math.max(16, Math.min(192, next));
          return next;
        });
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
    [maxPitch, minPitch, pxPerSemitone, totalPxX]
  );

  // KEYBOARD (delete selection)
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
