// src/components/daw/controls/pianoroll/index.tsx

"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { MidiNote } from "@/lib/audio/types";
import { useAudioEngine } from "@/lib/audio/core/audio-engine";
import { useUiStore } from "@/lib/stores/ui.store";
import { MidiTrack } from "@/lib/audio/sources/midi-track";
import { useInstrumentStore } from "@/lib/stores/instrument.store";
import { useSynthStore } from "@/lib/stores/synth.store";
import { useDualSynthStore } from "@/lib/stores/dual-synth.store";
import { MIN_PITCH, MAX_PITCH, KEY_WIDTH } from "./constants";
import * as coords from "./coords";
import { getHitAt, type Hit } from "./hit";
import { drawKeyboard } from "./draw/drawKeyboard";
import { drawGrid } from "./draw/drawGrid";
import { drawNotes } from "./draw/drawNotes";
import { PPQ, TransportScheduler } from "@/lib/audio/core/transport-scheduler";
import { VelocityLane } from "./lanes/VelocityLane";
import { LoopControls } from "./LoopControls";
import { PianoRollToolbar } from "./Toolbar";
import { NoteContextMenu } from "./NoteContextMenu";
import { snapToNoteEdges as utilSnapToNoteEdges, clampMoveAvoidOverlap as utilClampMove, clampResizeAvoidOverlap as utilClampResize } from "./utils";
import { quantizeNotes } from "@/lib/midi/utils";

export type PianoRollProps = {
  notes: ReadonlyArray<MidiNote>;
  bpm?: number;
  lengthBeats?: number;
  onChange?: (next: MidiNote[]) => void;
  playheadBeat?: number;
  loop?: { start: number; end: number } | null;
  onLoopChange?: (next: { start: number; end: number } | null) => void;
  active?: boolean; // this clip is currently triggered/playing
  followPlayhead?: boolean; // auto-scroll to keep playhead visible
};

export type DraftNote = MidiNote & { __id: number };

export const PianoRoll = memo(function PianoRoll({
  notes,
  lengthBeats = 4,
  onChange,
  playheadBeat,
  loop,
  onLoopChange,
  active = false,
  followPlayhead = true,
}: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Redraw function ref (used before draw() is defined in code order)
  const drawFnRef = useRef<() => void>(() => {});
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const audio = useAudioEngine();
  const selectedTrackId = useUiStore((s) => s.selectedTrackId);

  // Preview via MidiTrack of the selected track (device-aware)
  const previewTrackRef = useRef<MidiTrack | null>(null);
  const previewTrackForIdRef = useRef<string | null>(null);
  const previewModeRef = useRef<"midi" | "audio">("audio");

  const getOrCreatePreviewTrack = useCallback(() => {
    const tid = selectedTrackId;
    if (!tid) return null;
    // Recreate when track changes
    if (!previewTrackRef.current || previewTrackForIdRef.current !== tid) {
      const kind = useInstrumentStore.getState().getKind(tid);
      if (kind === "dual-synth") {
        const params = useDualSynthStore.getState().getParams(tid);
        previewTrackRef.current = new MidiTrack(tid, { instrument: "dual-synth", synthParams: params });
      } else if (kind === "simple-synth") {
        const params = useSynthStore.getState().getParams(tid);
        previewTrackRef.current = new MidiTrack(tid, { instrument: "simple-synth", synthParams: params });
      } else {
        // sampler preview fallback currently not implemented → keep audio preview
        previewTrackRef.current = null;
      }
      previewTrackForIdRef.current = tid;
    } else {
      // Refresh params on demand to reflect latest UI changes
      const kind = useInstrumentStore.getState().getKind(tid);
      if (kind === "dual-synth") {
        const params = useDualSynthStore.getState().getParams(tid);
        previewTrackRef.current.setInstrument("dual-synth");
        previewTrackRef.current.configureDual(params);
      } else if (kind === "simple-synth") {
        const params = useSynthStore.getState().getParams(tid);
        previewTrackRef.current.setInstrument("simple-synth");
        previewTrackRef.current.configureSynth(params);
      } else {
        previewTrackRef.current = null;
      }
    }
    return previewTrackRef.current;
  }, [selectedTrackId]);

  const pressedKeyRef = useRef<number | null>(null);
  const previewPointerIdRef = useRef<number | null>(null);

  const hoverPitchRef = useRef<number | null>(null);
  const hoverNoteRef = useRef<number | null>(null);
  const ghostRef = useRef<{ time: number; pitch: number } | null>(null);
  const playheadBeatRef = useRef<number | null>(null);
  const rafPendingRef = useRef(false);

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  // UI state
  const [pxPerBeat, setPxPerBeat] = useState(64);
  const [pxPerSemitone, setPxPerSemitone] = useState(14);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [snap, setSnap] = useState(true);
  const [snapEdges, setSnapEdges] = useState(true);
  const [grid, setGrid] = useState<4 | 8 | 12 | 16 | 24 | 32>(16);
  const [selected, setSelected] = useState<number[]>([]);
  const [dragMode, setDragMode] = useState<null | "move" | "resize" | "marquee" | "brush">(null);

  const [cursor, setCursor] = useState<"default" | "pointer" | "ew-resize">("default");
  const cursorRef = useRef(cursor);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  const draftRef = useRef<DraftNote[]>([]);
  const pointerStart = useRef<{
    x: number;
    y: number;
    noteIndex: number | null;
    initial: DraftNote[];
    anchorRight?: boolean; // during creation, keep right edge fixed
  } | null>(null);
  const lastGridXRef = useRef<number | null>(null);

  // Clipboard for copy/paste (relative timing)
  const clipboardRef = useRef<Array<{ pitch: number; time: number; duration: number; velocity: number }>>([]);

  // Velocity lane moved to dedicated component
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const brushRef = useRef<{ pitch: number; lastBeat: number | null } | null>(null);

  // Guides pendant drag
  const dragGuideRef = useRef<{ xCss: number; yCss: number; beat: number; pitch: number } | null>(null);

  // pitch range & layout
  const minPitch = MIN_PITCH;
  const maxPitch = MAX_PITCH;
  const keyWidth = KEY_WIDTH;
  const totalPxX = lengthBeats * pxPerBeat;
  const viewportHeightCssRef = useRef<number>(260);
  const userScrolledRef = useRef(false);
  const didAutoCenterRef = useRef(false);

  // Loop edit state (fallback local if no external control)
  const [loopState, setLoopState] = useState<{ start: number; end: number } | null>(loop ?? null);
  const loopDragRef = useRef<
    | null
    | {
        mode: "start" | "end" | "move" | "create";
        initial: { start: number; end: number } | null;
        offset?: number;
      }
  >(null);
  const loopBarHeight = 12;

  // sync props.notes -> draft (always trigger redraw)
  useEffect(() => {
    draftRef.current = notes.map((n, i) => ({ ...n, __id: i }));
    if (drawFnRef.current) drawFnRef.current();
  }, [notes]);

  // coordinate helpers
  const timeToX = useCallback((beat: number) => coords.timeToX(beat, pxPerBeat, scrollX, keyWidth), [keyWidth, pxPerBeat, scrollX]);
  const xToTime = useCallback((xCss: number) => coords.xToTime(xCss, pxPerBeat, scrollX, keyWidth), [keyWidth, pxPerBeat, scrollX]);
  const pitchToY = useCallback((pitch: number) => coords.pitchToY(pitch, maxPitch, pxPerSemitone, scrollY), [maxPitch, pxPerSemitone, scrollY]);
  const yToPitch = useCallback((yCss: number) => coords.yToPitch(yCss, minPitch, maxPitch, pxPerSemitone, scrollY), [maxPitch, minPitch, pxPerSemitone, scrollY]);

  const snapBeat = useCallback((beat: number) => {
    if (!snap) return beat;
    const step = 1 / grid;
    return Math.round(beat / step) * step;
  }, [snap, grid]);
  const snapMaybe = useCallback((beat: number, force: boolean) => {
    const step = 1 / grid;
    return (force || snap) ? Math.round(beat / step) * step : beat;
  }, [grid, snap]);

  // Snap to nearest note boundary on the same pitch (when snap is enabled)
  const snapToNoteEdges = useCallback((beat: number, pitch: number, exclude: ReadonlySet<number> | null) => {
    return utilSnapToNoteEdges(beat, pitch, draftRef.current, grid, snap, exclude);
  }, [grid, snap]);

  const clampMoveAvoidOverlap = useCallback((idx: number, nextTime: number, duration: number, pitch: number, exclude: ReadonlySet<number>) => {
    return utilClampMove(idx, nextTime, duration, pitch, draftRef.current, exclude);
  }, []);

  const clampResizeAvoidOverlap = useCallback((idx: number, time: number, nextDuration: number, pitch: number, exclude: ReadonlySet<number>) => {
    return utilClampResize(idx, time, nextDuration, pitch, draftRef.current, grid, exclude);
  }, [grid]);

  const stopAnyPreview = () => {
    if (pressedKeyRef.current == null) return;
    const pitch = pressedKeyRef.current;
    try {
      if (previewModeRef.current === "midi") {
        const mt = previewTrackRef.current ?? getOrCreatePreviewTrack();
        mt?.noteOff(pitch);
      } else {
        audio.stopPreviewNote(pitch);
      }
    } finally {
      pressedKeyRef.current = null;
    }
  };

  // helpers will be declared after draw() to satisfy deps
  // Performance metrics refs
  const perfRef = useRef<{ lastDrawMs: number; avgMs: number; samples: number; visible: number; total: number; lastUpdate: number }>({
    lastDrawMs: 0,
    avgMs: 0,
    samples: 0,
    visible: 0,
    total: 0,
    lastUpdate: 0,
  });
  // Reusable buffer to avoid allocating an array on every frame
  const culledBufferRef = useRef<DraftNote[]>([]);
  const [perfStats, setPerfStats] = useState<{ avgMs: number; visible: number; total: number } | null>(null);
  useEffect(() => {
    let mounted = true;
    const loop = () => {
      if (!mounted) return;
      const p = perfRef.current;
      // EMA update only when we have a fresh draw time
      if (p.lastDrawMs > 0) {
        p.samples += 1;
        p.avgMs += (p.lastDrawMs - p.avgMs) * 0.05; // smoothing factor
      }
      const now = performance.now();
      if (now - p.lastUpdate >= 500) { // 2 Hz refresh
        p.lastUpdate = now;
        setPerfStats({ avgMs: p.avgMs, visible: p.visible, total: p.total });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { mounted = false; };
  }, []);

  

  // DRAW
  const drawBase = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = ctxRef.current;
    if (!cvs || !ctx) return;

    const W = cvs.width;
    const H = cvs.height;
    const wCss = W / dpr;
    const hCss = H / dpr;

    // (Skip optimization removed for stability)

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr, dpr);

    // background
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, wCss, hCss);

    // keyboard gutter
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

    // grid + notes on the right
    ctx.save();
    ctx.translate(keyWidth, 0);

    drawGrid(ctx, { wCss, hCss, keyWidth, scrollX, pxPerBeat, grid, timeToX });

    // Optional loop shading using editable state
    // top band baseline (hint for loop area)
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, wCss - keyWidth, 12);
    ctx.beginPath();
    ctx.strokeStyle = "#404040";
    ctx.moveTo(0, 12 + 0.5);
    ctx.lineTo(wCss - keyWidth, 12 + 0.5);
    ctx.stroke();

    const activeLoop = loop ?? loopState;
    if (activeLoop && activeLoop.end > activeLoop.start) {
      const lx0 = timeToX(activeLoop.start) - keyWidth;
      const lx1 = timeToX(activeLoop.end) - keyWidth;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(lx0, 0, lx1 - lx0, hCss);
      // handles and top band overlay
      ctx.fillStyle = "#FFD02F";
      ctx.fillRect(lx0 - 2, 0, 4, loopBarHeight);
      ctx.fillRect(lx1 - 2, 0, 4, loopBarHeight);
      ctx.fillStyle = "rgba(255,208,47,0.12)";
      ctx.fillRect(lx0, 0, Math.max(0, lx1 - lx0), loopBarHeight);
    }

    // Viewport culling for perf: only draw notes intersecting visible region
    // Visible beat span: left grid edge (keyWidth) to right canvas edge (wCss)
    const x0Beat = Math.max(0, xToTime(keyWidth));
    const x1Beat = xToTime(wCss);
    // Visible pitch span: top (0) to bottom (hCss) using yToPitch which already accounts for scrollY
    const y0Pitch = yToPitch(0);      // highest visible pitch
    const y1Pitch = yToPitch(hCss);   // lowest visible pitch
    const t0 = performance.now();
    const culled = culledBufferRef.current;
    culled.length = 0; // reset in place
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
    const t1 = performance.now();
    perfRef.current.lastDrawMs = t1 - t0;
    perfRef.current.visible = culled.length;
    perfRef.current.total = draftRef.current.length;

    // ghost note preview on hover (no drag)
    if (!pointerStart.current && ghostRef.current) {
      const g = ghostRef.current;
      const gx = timeToX(g.time);
      const gy = pitchToY(g.pitch);
      const gw = pxPerBeat / grid; // default duration 1/grid
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#7aa2ff";
      ctx.fillRect(gx - keyWidth, gy + 2, Math.max(8, gw - 2), Math.max(4, pxPerSemitone - 4));
      ctx.globalAlpha = 1;
    }

    // marquee selection overlay
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

    // guides de drag (temps/pitch) si en cours
    if (dragGuideRef.current) {
      const g = dragGuideRef.current;
      const vx = g.xCss - keyWidth + 0.5;
      const hy = g.yCss + 0.5;
      ctx.save();
      ctx.strokeStyle = "rgba(255,208,47,0.4)";
      ctx.setLineDash([4, 4]);
      // ligne verticale temps
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx, hCss);
      ctx.stroke();
      // ligne horizontale pitch
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(wCss - keyWidth, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      // labels discrets
      ctx.fillStyle = "#FFD02F";
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      const lblTime = g.beat.toFixed(3);
      const lblPitch = String(g.pitch);
      ctx.fillText(lblTime, Math.max(0, Math.min(wCss - keyWidth - 40, vx + 6)), Math.max(10, hy - 6));
      ctx.fillText(lblPitch, Math.max(0, Math.min(wCss - keyWidth - 30, vx + 6)), Math.min(hCss - 2, hy + 12));
      ctx.restore();
    }

    ctx.restore();
  }, [dpr, grid, pitchToY, pxPerBeat, pxPerSemitone, scrollX, scrollY, selected, timeToX, keyWidth, maxPitch, minPitch, loop, loopState, xToTime, yToPitch]);

  const drawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    const W = overlay.width;
    const H = overlay.height;
    const wCss = W / dpr;
    const hCss = H / dpr;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.scale(dpr,dpr);
    // playhead
    const phBeat = active ? (typeof playheadBeat === "number" ? playheadBeat : playheadBeatRef.current) : null;
    if (active && typeof phBeat === "number") {
      const px = timeToX(phBeat) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = "#FFD02F";
      ctx.moveTo(px, 0);
      ctx.lineTo(px, hCss);
      ctx.stroke();
    }
    // drag guides (re-drawn here for lighter updates)
    if (dragGuideRef.current) {
      const g = dragGuideRef.current;
      const vx = g.xCss + 0.5;
      const hy = g.yCss + 0.5;
      ctx.save();
      ctx.strokeStyle = "rgba(255,208,47,0.4)";
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(vx,0); ctx.lineTo(vx,hCss); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0,hy); ctx.lineTo(wCss,hy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#FFD02F";
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      const lblTime = g.beat.toFixed(3);
      const lblPitch = String(g.pitch);
      ctx.fillText(lblTime, Math.max(0, Math.min(wCss - 40, vx + 6)), Math.max(10, hy - 6));
      ctx.fillText(lblPitch, Math.max(0, Math.min(wCss - 30, vx + 6)), Math.min(hCss - 2, hy + 12));
      ctx.restore();
    }
  }, [active, dpr, playheadBeat, timeToX]);

  const draw = useCallback(() => {
    drawBase();
    drawOverlay();
  }, [drawBase, drawOverlay]);
  // assign latest draw to ref
  useEffect(() => { drawFnRef.current = draw; }, [draw]);

  // helpers (after draw to satisfy deps)
  const toMidi = useCallback((arr: DraftNote[]): MidiNote[] => arr.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })), []);
  const emitFrom = useCallback((arr: DraftNote[]) => {
    draftRef.current = arr;
    draw();
    onChange?.(toMidi(arr));
  }, [draw, onChange, toMidi]);

  // Quantize handler extracted for Toolbar (placed after draw to satisfy deps)
  const onQuantize = useCallback(() => {
    const sel = selected.length ? new Set(selected) : new Set(draftRef.current.map((_n, i) => i));
    const next = draftRef.current.slice();
    // Pré-quantize (time & duration) pour notes sélectionnées
    for (let i = 0; i < next.length; i++) {
      if (!sel.has(i)) continue;
      const q = quantizeNotes([{ pitch: next[i]!.pitch, time: next[i]!.time, duration: next[i]!.duration, velocity: next[i]!.velocity }], grid)[0]!;
      next[i] = { ...next[i]!, time: q.time, duration: q.duration };
    }
    // Clamp overlap par pitch
    const byPitch = new Map<number, number[]>();
    for (let i = 0; i < next.length; i++) {
      if (!sel.has(i)) continue;
      const p = next[i]!.pitch;
      const arr = byPitch.get(p) ?? [];
      arr.push(i);
      byPitch.set(p, arr);
    }
    byPitch.forEach((indices, p) => {
      indices.sort((a, b) => next[a]!.time - next[b]!.time);
      for (const i of indices) {
        const n = next[i]!;
        const exclude = new Set<number>();
        for (let k = 0; k < next.length; k++) if (!sel.has(k) || k === i) exclude.add(k);
        const t = clampMoveAvoidOverlap(i, n.time, n.duration, p, exclude);
        const d = clampResizeAvoidOverlap(i, t, n.duration, p, exclude);
        next[i] = { ...n, time: Math.max(0, t), duration: d };
      }
    });
    emitFrom(next);
  }, [grid, selected, clampMoveAvoidOverlap, clampResizeAvoidOverlap, emitFrom]);


  // setup canvas + ResizeObserver
  useEffect(() => {
    const cvs = canvasRef.current;
    const parent = wrapRef.current;
    if (!cvs || !parent) return;

    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;
    const overlay = overlayCanvasRef.current;
    // No need to store overlay context; acquired on each overlay draw

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

      // Velocity lane handled by dedicated component

      // Initial auto-center on first sizing
      if (!didAutoCenterRef.current) {
        const viewport = viewportHeightCssRef.current ?? 0;
        const content = (maxPitch - minPitch + 1) * pxPerSemitone;
        const maxY = Math.max(0, content - viewport);
        const centerPitch = notes.length
          ? Math.min(maxPitch, Math.max(minPitch, (Math.min(...notes.map(n => n.pitch)) + Math.max(...notes.map(n => n.pitch))) / 2))
          : 60; // C4 par défaut
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

  // Subscribe to live playhead from TransportScheduler if available
  useEffect(() => {
    const sch = TransportScheduler.ensure();
    const unsub = sch.subscribe((pos) => {
      const beat = (pos.bar - 1) * 4 + (pos.beat - 1) + pos.tick / PPQ;
      playheadBeatRef.current = beat;
      if (active) {
        if (!rafPendingRef.current) {
          rafPendingRef.current = true;
          requestAnimationFrame(() => {
            rafPendingRef.current = false;
            // Auto-follow horizontally if enabled and playhead goes out of view
            if (followPlayhead) {
              const wrap = wrapRef.current;
              if (wrap) {
                const px = timeToX(beat) - keyWidth; // CSS x inside grid area
                const margin = 24;
                const viewW = wrap.clientWidth;
                if (px > viewW - margin) {
                  const target = Math.min((lengthBeats * pxPerBeat) - viewW, scrollX + (px - (viewW - margin)));
                  if (!Number.isNaN(target) && Number.isFinite(target)) setScrollX(Math.max(0, target));
                } else if (px < margin) {
                  const target = Math.max(0, scrollX + (px - margin));
                  if (!Number.isNaN(target) && Number.isFinite(target)) setScrollX(target);
                }
              }
            }
            draw();
          });
        }
      }
    });
    return () => unsub();
  }, [active, followPlayhead, draw, drawOverlay, keyWidth, lengthBeats, pxPerBeat, scrollX, timeToX]);

  // redraw when UI/notes change
  useEffect(() => {
    draw();
  }, [draw, pxPerBeat, pxPerSemitone, scrollX, scrollY, grid, selected, notes]);

  // Recenter when notes set changes significantly and user hasn't scrolled
  useEffect(() => {
    if (userScrolledRef.current) return;
    const viewport = viewportHeightCssRef.current ?? 0;
    if (!viewport) return;
    const content = (maxPitch - minPitch + 1) * pxPerSemitone;
    const maxY = Math.max(0, content - viewport);
    const centerPitch = notes.length
      ? Math.min(maxPitch, Math.max(minPitch, (Math.min(...notes.map(n => n.pitch)) + Math.max(...notes.map(n => n.pitch))) / 2))
      : 60;
    const target = Math.min(maxY, Math.max(0, (maxPitch - centerPitch) * pxPerSemitone - viewport / 2));
    const raf = requestAnimationFrame(() => setScrollY(target));
    return () => cancelAnimationFrame(raf);
  }, [notes, pxPerSemitone, maxPitch, minPitch]);

  // HIT TEST helper
  const getHit = (xCss: number, yCss: number): Hit => {
    return getHitAt(xCss, yCss, draftRef.current, {
      keyWidth,
      pxPerBeat,
      pxPerSemitone,
      timeToX,
      pitchToY,
    });
  };

  // POINTERS
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;

    // Loop bar interaction (top band in grid)
    if (xCss >= keyWidth && yCss <= loopBarHeight) {
      const beat = snapMaybe(xToTime(xCss), true);
      const cur = loop ?? loopState;
      if (cur && cur.end > cur.start) {
        const xStart = timeToX(cur.start) - keyWidth;
        const xEnd = timeToX(cur.end) - keyWidth;
        const near = 6;
        if (Math.abs((xCss - keyWidth) - xStart) <= near) {
          loopDragRef.current = { mode: "start", initial: { ...cur } };
        } else if (Math.abs((xCss - keyWidth) - xEnd) <= near) {
          loopDragRef.current = { mode: "end", initial: { ...cur } };
        } else if ((xCss - keyWidth) > xStart && (xCss - keyWidth) < xEnd) {
          loopDragRef.current = { mode: "move", initial: { ...cur }, offset: beat - cur.start };
        } else {
          loopDragRef.current = { mode: "create", initial: null };
          const start = beat;
          const end = Math.min(lengthBeats, start + 1 / grid);
          setLoopState({ start: Math.max(0, Math.min(end - 1 / grid, start)), end });
        }
      } else {
        loopDragRef.current = { mode: "create", initial: null };
        const start = beat;
        const end = Math.min(lengthBeats, start + 1 / grid);
        setLoopState({ start: Math.max(0, Math.min(end - 1 / grid, start)), end });
      }
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      draw();
      return;
    }

    // keyboard area -> sustain preview
    if (xCss < keyWidth) {
      const pitch = Math.ceil(yToPitch(yCss));
      pressedKeyRef.current = pitch;
      previewPointerIdRef.current = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      hoverPitchRef.current = pitch;
      draw();
      // Prefer device-aware preview through the selected track's instrument
      const mt = getOrCreatePreviewTrack();
      if (mt) {
        previewModeRef.current = "midi";
        try { mt.noteOn(pitch); } catch {}
      } else {
        previewModeRef.current = "audio";
        audio.startPreviewNote(pitch).catch(() => {});
      }
      return;
    }

    const { index, mode } = getHit(xCss, yCss);
    let initial = draftRef.current.map((n) => ({ ...n }));

    let noteIndex = index;
    let previewPitch: number | null = null;

    if (index === null) {
      // Empty grid
      if (e.altKey) {
        // Brush paint start
        const beat = snapMaybe(xToTime(xCss), true);
        const pitch = Math.ceil(yToPitch(yCss));
        const rowTop = pitchToY(pitch);
        const frac = 1 - Math.min(1, Math.max(0, (yCss - rowTop) / pxPerSemitone));
        const velocity = Math.max(0.2, Math.min(1, frac));
        const newNote: DraftNote = { __id: Date.now(), pitch, time: beat, duration: 1 / grid, velocity };
        draftRef.current = [...draftRef.current, newNote];
        brushRef.current = { pitch, lastBeat: beat };
        setSelected([draftRef.current.length - 1]);
        setDragMode("brush");
        previewPitch = pitch;
      } else if (e.ctrlKey || e.metaKey) {
        // Marquee selection start
        marqueeRef.current = { x0: xCss, y0: yCss, x1: xCss, y1: yCss };
        setDragMode("marquee");
      } else {
        const beat = snapMaybe(xToTime(xCss), e.shiftKey);
        const pitch = Math.ceil(yToPitch(yCss));
        // Velocity based on vertical position inside the semitone band (top = louder)
        const rowTop = pitchToY(pitch);
        const frac = 1 - Math.min(1, Math.max(0, (yCss - rowTop) / pxPerSemitone));
        const velocity = Math.max(0.2, Math.min(1, frac));
        const newNote: DraftNote = { __id: Date.now(), pitch, time: beat, duration: 1 / grid, velocity };
        draftRef.current = [...draftRef.current, newNote];
        // ensure initial snapshot includes the newly created note
        initial = [...initial, { ...newNote }];
        noteIndex = draftRef.current.length - 1;
        previewPitch = pitch;
        setSelected([noteIndex]);
        setDragMode("resize");
      }
    } else {
      noteIndex = index;
      previewPitch = draftRef.current[index].pitch;
      if (e.ctrlKey || e.metaKey) {
        // toggle selection without dragging
        setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)));
      } else {
        setSelected([index]);
        setDragMode(mode);
      }
    }

    pointerStart.current = { x: xCss, y: yCss, noteIndex, initial, anchorRight: index === null };

    // Preview uniquement via le clavier (zone gauche). Pas de preview sur création/sélection dans la grille.
    if (previewPitch != null && xCss < keyWidth) {
      stopAnyPreview();
      pressedKeyRef.current = previewPitch;
      const mt = getOrCreatePreviewTrack();
      if (mt) {
        previewModeRef.current = "midi";
        try { mt.noteOn(previewPitch); } catch {}
      } else {
        previewModeRef.current = "audio";
        audio.startPreviewNote(previewPitch).catch(() => {});
      }
    }

    canvas.setPointerCapture(e.pointerId);
    if (dragMode === "marquee") {
      setCursor("default");
    } else if (dragMode === "brush") {
      setCursor("pointer");
    } else {
      setCursor(mode === "resize" ? "ew-resize" : "pointer");
    }
    draw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    lastGridXRef.current = xCss;

    // Loop drag move
    if (loopDragRef.current) {
      const mode = loopDragRef.current.mode;
      const beat = snapMaybe(xToTime(xCss), true);
      if (mode === "start" && loopDragRef.current.initial) {
        const end = loopDragRef.current.initial.end;
        const start = Math.max(0, Math.min(end - 1 / grid, beat));
        setLoopState({ start, end });
      } else if (mode === "end" && loopDragRef.current.initial) {
        const start = loopDragRef.current.initial.start;
        const end = Math.min(lengthBeats, Math.max(start + 1 / grid, beat));
        setLoopState({ start, end });
      } else if (mode === "move" && loopDragRef.current.initial && typeof loopDragRef.current.offset === "number") {
        const len = loopDragRef.current.initial.end - loopDragRef.current.initial.start;
        let start = beat - loopDragRef.current.offset;
        start = Math.max(0, Math.min(lengthBeats - len, start));
        const end = start + len;
        setLoopState({ start, end });
      } else if (mode === "create") {
        const s = (loop ?? loopState)?.start ?? beat;
        const start = Math.min(s, beat);
        const end = Math.max(s, beat);
        const minEnd = Math.min(lengthBeats, Math.max(start + 1 / grid, end));
        setLoopState({ start, end: minEnd });
      }
      draw();
      return;
    }
    if (pointerStart.current) {
      // mettre à jour guides de drag
      const beat = snapMaybe(xToTime(xCss), false);
      const pitch = Math.ceil(yToPitch(yCss));
      dragGuideRef.current = { xCss, yCss, beat, pitch };
    } else {
      dragGuideRef.current = null;
    }

    // drag on keyboard (sustain)
    if (previewPointerIdRef.current === e.pointerId) {
      if (xCss < keyWidth) {
        const pitch = Math.ceil(yToPitch(yCss));
        if (pressedKeyRef.current !== pitch) {
          const prev = pressedKeyRef.current;
          if (prev != null) {
            if (previewModeRef.current === "midi") {
              const mt = previewTrackRef.current ?? getOrCreatePreviewTrack();
              try { mt?.noteOff(prev); } catch {}
            } else {
              audio.stopPreviewNote(prev);
            }
          }
          pressedKeyRef.current = pitch;
          hoverPitchRef.current = pitch;
          draw();
          const mt = getOrCreatePreviewTrack();
          if (mt) {
            previewModeRef.current = "midi";
            try { mt.noteOn(pitch); } catch {}
          } else {
            previewModeRef.current = "audio";
            audio.startPreviewNote(pitch).catch(() => {});
          }
        }
        return;
      }
      // leaving keyboard
      if (pressedKeyRef.current != null) {
        if (previewModeRef.current === "midi") {
          const mt = previewTrackRef.current ?? getOrCreatePreviewTrack();
          try { mt?.noteOff(pressedKeyRef.current); } catch {}
        } else {
          audio.stopPreviewNote(pressedKeyRef.current);
        }
        pressedKeyRef.current = null;
        hoverPitchRef.current = null;
        draw();
      }
      return;
    }

    // hover only
    if (!pointerStart.current) {
      if (xCss < keyWidth) {
        const pitch = Math.ceil(yToPitch(yCss));
        hoverPitchRef.current = pitch >= minPitch && pitch <= maxPitch ? pitch : null;
        hoverNoteRef.current = null;
        if (cursorRef.current !== "default") setCursor("default");
        draw();
        return;
      }

      const { index, mode } = getHit(xCss, yCss);
      hoverNoteRef.current = index;
      const hoverPitch = index != null ? draftRef.current[index].pitch : Math.ceil(yToPitch(yCss));
      hoverPitchRef.current = hoverPitch;
      // ghost preview for creation when not over an existing note
      if (index == null) {
        const beat = snapMaybe(xToTime(xCss), false);
        ghostRef.current = { time: beat, pitch: hoverPitch };
      } else {
        ghostRef.current = null;
      }
      const nextCursor = index == null ? "default" : mode === "resize" ? "ew-resize" : "pointer";
      if (nextCursor !== cursorRef.current) setCursor(nextCursor);
      draw();
      return;
    }

    // marquee selection drag
    if (dragMode === "marquee" && marqueeRef.current) {
      marqueeRef.current = { ...marqueeRef.current, x1: xCss, y1: yCss };
      const m = marqueeRef.current;
      const rx0 = Math.min(m.x0, m.x1);
      const rx1 = Math.max(m.x0, m.x1);
      const ry0 = Math.min(m.y0, m.y1);
      const ry1 = Math.max(m.y0, m.y1);
      const sel: number[] = [];
      for (let i = 0; i < draftRef.current.length; i++) {
        const n = draftRef.current[i]!;
        const nx0 = timeToX(n.time) - keyWidth;
        const nx1 = nx0 + Math.max(4, n.duration * pxPerBeat - 2);
        const ny0 = pitchToY(n.pitch) + 1;
        const ny1 = ny0 + Math.max(5, pxPerSemitone - 3);
        if (nx0 < rx1 && nx1 > rx0 && ny0 < ry1 && ny1 > ry0) sel.push(i);
      }
      setSelected(sel);
      draw();
      return;
    }

    // brush painting drag
    if (dragMode === "brush" && brushRef.current) {
      const beat = snapMaybe(xToTime(xCss), true);
      const { pitch, lastBeat } = brushRef.current;
      if (lastBeat == null || Math.abs(beat - lastBeat) >= 1 / grid - 1e-6) {
        const exists = draftRef.current.some((n) => n.pitch === pitch && Math.abs(n.time - beat) < 1e-6);
        if (!exists) {
          const rowTop = pitchToY(pitch);
          const frac = 1 - Math.min(1, Math.max(0, (yCss - rowTop) / pxPerSemitone));
          const velocity = Math.max(0.2, Math.min(1, frac));
          draftRef.current = [...draftRef.current, { __id: Date.now(), pitch, time: beat, duration: 1 / grid, velocity }];
          brushRef.current = { pitch, lastBeat: beat };
          setSelected([draftRef.current.length - 1]);
          draw();
        }
      }
      return;
    }

    // drag note
    const dxCss = xCss - pointerStart.current.x;
    const dyCss = yCss - pointerStart.current.y;

    const idx = pointerStart.current.noteIndex;
    if (idx == null) return;

    const notes = draftRef.current.slice();
    const original = pointerStart.current.initial[idx]!;

    if (dragMode === "move") {
      if (e.altKey) {
        // Adjust velocity only for focused note (multi-velocity edit à venir)
        const rowTop = pitchToY(original.pitch);
        const frac = 1 - Math.min(1, Math.max(0, (yCss - rowTop) / pxPerSemitone));
        const velocity = Math.max(0.2, Math.min(1, frac));
        notes[idx] = { ...notes[idx], velocity };
      } else if (selected.includes(idx) && selected.length > 1) {
        const dt = dxCss / pxPerBeat;
        const dp = Math.round(-dyCss / pxPerSemitone);
        const exclude = new Set(selected);
        for (const i of selected) {
          const orig = pointerStart.current.initial[i]!;
          const pitch = Math.max(minPitch, Math.min(maxPitch, orig.pitch + dp));
          // grid snap
          let nextTime = snapMaybe(orig.time + dt, e.shiftKey);
          // additional snap to note edges on same pitch
          if (snapEdges) nextTime = snapToNoteEdges(nextTime, pitch, exclude);
          // avoid overlap with non-selected neighbors
          nextTime = clampMoveAvoidOverlap(i, nextTime, notes[i].duration, pitch, exclude);
          notes[i] = { ...notes[i], time: Math.max(0, nextTime), pitch };
          hoverPitchRef.current = pitch;
        }
      } else {
        let nextTime = snapMaybe(original.time + dxCss / pxPerBeat, e.shiftKey);
        const nextPitch = Math.round(original.pitch - dyCss / pxPerSemitone);
        const clampedPitch = Math.max(minPitch, Math.min(maxPitch, nextPitch));
        // extra snap and avoid overlap
        const exclude = new Set([idx]);
        if (snapEdges) nextTime = snapToNoteEdges(nextTime, clampedPitch, exclude);
        nextTime = clampMoveAvoidOverlap(idx, nextTime, notes[idx].duration, clampedPitch, exclude);
        notes[idx] = { ...notes[idx], time: Math.max(0, nextTime), pitch: clampedPitch };
        hoverPitchRef.current = clampedPitch;
      }
    } else if (dragMode === "resize") {
      // One-sided resize from the start point: right increases duration, left decreases duration
      const deltaBeats = dxCss / pxPerBeat;
      const rawDur = original.duration + deltaBeats;
      const snapped = snapMaybe(rawDur, e.shiftKey);
      let nextDur = Math.max(1 / grid, snapped);
      if (selected.includes(idx) && selected.length > 1) {
        const dp = (e.ctrlKey || e.metaKey) ? Math.round(-dyCss / pxPerSemitone) : 0;
        const exclude = new Set(selected);
        for (const i of selected) {
          const orig = pointerStart.current.initial[i]!;
          let dur = Math.max(1 / grid, snapMaybe(orig.duration + deltaBeats, e.shiftKey));
          // snap end to neighbor edges on same pitch
          const endBeat = snapEdges ? snapToNoteEdges(orig.time + dur, orig.pitch + dp, exclude) : (orig.time + dur);
          dur = Math.max(1 / grid, endBeat - orig.time);
          // avoid overlap with next neighbor
          dur = clampResizeAvoidOverlap(i, orig.time, dur, orig.pitch + dp, exclude);
          const pitch = Math.max(minPitch, Math.min(maxPitch, orig.pitch + dp));
          notes[i] = { ...notes[i], duration: dur, pitch };
          hoverPitchRef.current = pitch;
        }
      } else {
        if (e.ctrlKey || e.metaKey) {
          const nextPitch = Math.round(original.pitch - dyCss / pxPerSemitone);
          const clampedPitch = Math.max(minPitch, Math.min(maxPitch, nextPitch));
          // snap end to neighbor edges
          const endBeat = snapEdges ? snapToNoteEdges(original.time + nextDur, clampedPitch, new Set([idx])) : (original.time + nextDur);
          nextDur = Math.max(1 / grid, endBeat - original.time);
          nextDur = clampResizeAvoidOverlap(idx, original.time, nextDur, clampedPitch, new Set([idx]));
          notes[idx] = { ...notes[idx], duration: nextDur, pitch: clampedPitch };
          hoverPitchRef.current = clampedPitch;
        } else {
          // snap end and avoid overlap
          const endBeat = snapEdges ? snapToNoteEdges(original.time + nextDur, original.pitch, new Set([idx])) : (original.time + nextDur);
          nextDur = Math.max(1 / grid, endBeat - original.time);
          nextDur = clampResizeAvoidOverlap(idx, original.time, nextDur, original.pitch, new Set([idx]));
          notes[idx] = { ...notes[idx], duration: nextDur };
        }
      }
    }

    draftRef.current = notes;

    // Auto-scroll near edges while dragging
    const wrap = wrapRef.current;
    if (wrap) {
      const threshold = 14;
      // vertical
      if (yCss < threshold) {
        setScrollY((prev) => Math.max(0, prev - 8));
      } else if (yCss > wrap.clientHeight - threshold) {
        const content = (maxPitch - minPitch + 1) * pxPerSemitone;
        const maxY = Math.max(0, content - (viewportHeightCssRef.current ?? 0));
        setScrollY((prev) => Math.min(maxY, prev + 8));
      }
      // horizontal (only when resizing)
      if (dragMode === "resize") {
        if (xCss > wrap.clientWidth - threshold) {
          const maxX = Math.max(0, totalPxX - (wrap.clientWidth ?? 0));
          setScrollX((prev) => Math.min(maxX, prev + 8));
        } else if (xCss < keyWidth + threshold) {
          setScrollX((prev) => Math.max(0, prev - 8));
        }
      }
    }
    draw();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}

    // finalize loop edits first
    if (loopDragRef.current) {
      const cur = loopState;
      loopDragRef.current = null;
      if (cur && cur.end > cur.start) onLoopChange?.(cur);
      draw();
      return;
    }

    if (previewPointerIdRef.current === e.pointerId) {
      previewPointerIdRef.current = null;
      stopAnyPreview();
      hoverPitchRef.current = null;
      draw();
      return;
    }

    if (!pointerStart.current) {
      stopAnyPreview();
      hoverNoteRef.current = null;
      hoverPitchRef.current = null;
      setCursor("default");
      draw();
      return;
    }

    // finalize different modes
    if (dragMode === "marquee") {
      marqueeRef.current = null;
      pointerStart.current = null;
      setDragMode(null);
      stopAnyPreview();
      hoverNoteRef.current = null;
      hoverPitchRef.current = null;
      setCursor("default");
      draw();
      return;
    }

    if (dragMode === "brush") {
      brushRef.current = null;
    }

    // finalize geometry revision after drag operation
    // ensure final redraw already occurred; no skip signature to reset
    pointerStart.current = null;
    setDragMode(null);
    stopAnyPreview();
    hoverNoteRef.current = null;
    hoverPitchRef.current = null;
    dragGuideRef.current = null;
    setCursor("default");
    draw();

    onChange?.(draftRef.current.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
  };

  const onPointerLeave = () => {
    hoverNoteRef.current = null;
    hoverPitchRef.current = null;
    ghostRef.current = null;
    marqueeRef.current = null;
    dragGuideRef.current = null;
    if (!pointerStart.current && previewPointerIdRef.current == null) {
      setCursor("default");
    }
    draw();
  };

  // Right-click: prevent default (context menu handled by wrapper)
  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  };

  // Context menu handlers
  const handleDeleteSelected = useCallback(() => {
    if (selected.length === 0) return;
    const toDelete = new Set(selected);
    const next = draftRef.current.filter((_, i) => !toDelete.has(i));
    draftRef.current = next;
    setSelected([]);
    draw();
    onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
  }, [selected, onChange, draw]);

  const handleDuplicateSelected = useCallback(() => {
    if (selected.length === 0) return;
    const sel = selected.map((i) => draftRef.current[i]!);
    const dupes: DraftNote[] = sel.map((n) => ({
      __id: Date.now() + Math.random(),
      pitch: n.pitch,
      time: snapBeat(n.time + n.duration),
      duration: n.duration,
      velocity: n.velocity ?? 0.8,
    }));
    const next = [...draftRef.current, ...dupes];
    draftRef.current = next;
    setSelected(dupes.map((_, i) => draftRef.current.length - dupes.length + i));
    draw();
    onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
  }, [selected, onChange, draw, snapBeat]);

  const handleTransposeSelected = useCallback((semitones: number) => {
    if (selected.length === 0) return;
    const sel = new Set(selected);
    const next = draftRef.current.map((n, i) => {
      if (!sel.has(i)) return n;
      const newPitch = Math.max(minPitch, Math.min(maxPitch, n.pitch + semitones));
      return { ...n, pitch: newPitch };
    });
    draftRef.current = next;
    draw();
    onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
  }, [selected, onChange, draw, minPitch, maxPitch]);

  const handleQuantizeSelected = useCallback((gridValue: 4 | 8 | 16 | 32) => {
    if (selected.length === 0) return;
    const sel = new Set(selected);
    const toQuantize = draftRef.current.filter((_, i) => sel.has(i)).map(n => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity }));
    const quantized = quantizeNotes(toQuantize, gridValue, 1.0);
    let qIdx = 0;
    const result = draftRef.current.map((n, i) => {
      if (!sel.has(i)) return n;
      const q = quantized[qIdx++]!;
      return { ...n, time: q.time, duration: q.duration };
    });
    draftRef.current = result;
    draw();
    onChange?.(result.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
  }, [selected, onChange, draw]);

  const handleSetVelocitySelected = useCallback((value: number) => {
    if (selected.length === 0) return;
    const sel = new Set(selected);
    const next = draftRef.current.map((n, i) => (sel.has(i) ? { ...n, velocity: value } : n));
    draftRef.current = next;
    draw();
    onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
  }, [selected, onChange, draw]);

  // Double click: create or delete
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    const { index } = getHit(xCss, yCss);
    if (index != null) {
      const next = draftRef.current.slice();
      next.splice(index, 1);
      draftRef.current = next;
      setSelected([]);
      draw();
      onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
      return;
    }
    if (xCss >= keyWidth) {
      const beat = snapMaybe(xToTime(xCss), true);
      const pitch = Math.ceil(yToPitch(yCss));
      const rowTop = pitchToY(pitch);
      const frac = 1 - Math.min(1, Math.max(0, (yCss - rowTop) / pxPerSemitone));
      const velocity = Math.max(0.2, Math.min(1, frac));
      const newNote: DraftNote = { __id: Date.now(), pitch, time: beat, duration: 1 / grid, velocity };
      const next = [...draftRef.current, newNote];
      draftRef.current = next;
      setSelected([next.length - 1]);
      draw();
      onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
    }
  };

  // Keyboard shortcuts on wrapper
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Copy selected notes (Ctrl+C)
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      if (selected.length === 0) return;
      const sel = selected.map((i) => draftRef.current[i]!);
      // Store relative to first note's time
      const minTime = Math.min(...sel.map((n) => n.time));
      clipboardRef.current = sel.map((n) => ({
        pitch: n.pitch,
        time: n.time - minTime, // relative offset
        duration: n.duration,
        velocity: n.velocity ?? 0.8,
      }));
      e.preventDefault();
      return;
    }

    // Paste notes (Ctrl+V)
    if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
      if (clipboardRef.current.length === 0) return;
      // Paste at current grid cursor position, or at time=0 if no cursor
      const xCss = lastGridXRef.current ?? keyWidth;
      const targetBeat = snapBeat(xToTime(xCss));
      
      const pasted: DraftNote[] = clipboardRef.current.map((rel) => ({
        __id: Date.now() + Math.random(),
        pitch: rel.pitch,
        time: targetBeat + rel.time,
        duration: rel.duration,
        velocity: rel.velocity,
      }));

      // Check collisions and shift if needed
      const existing = draftRef.current;
      const validated: DraftNote[] = [];
      for (const p of pasted) {
        let finalTime = p.time;
        // Basic collision avoidance: shift right if overlaps
        let maxAttempts = 100;
        while (maxAttempts-- > 0) {
          const overlap = existing.some(
            (ex) => ex.pitch === p.pitch && ex.time < finalTime + p.duration && ex.time + ex.duration > finalTime
          );
          if (!overlap) break;
          finalTime += 1 / grid; // shift by grid step
        }
        validated.push({ ...p, time: finalTime });
      }

      const next = [...draftRef.current, ...validated];
      draftRef.current = next;
      // Select pasted notes
      const newIndices = validated.map((_, i) => existing.length + i);
      setSelected(newIndices);
      draw();
      onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
      e.preventDefault();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
      // Select all notes
      setSelected(draftRef.current.map((_n, i) => i));
      e.preventDefault();
      return;
    }
    // Split at cursor beat
    if (e.key === "s" || e.key === "S") {
      const xCss = lastGridXRef.current;
      if (xCss == null) return;
      const beat = snapMaybe(xToTime(xCss), true);
      const eps = 1e-6;
      const indices = selected.length ? [...selected] : draftRef.current.map((_n, i) => i);
      const out: DraftNote[] = [];
      for (let i = 0; i < draftRef.current.length; i++) {
        const n = draftRef.current[i]!;
        if (!indices.includes(i)) { out.push(n); continue; }
        const start = n.time;
        const end = n.time + n.duration;
        if (beat > start + eps && beat < end - eps) {
          const left: DraftNote = { __id: Date.now(), pitch: n.pitch, time: start, duration: beat - start, velocity: n.velocity };
          const right: DraftNote = { __id: Date.now() + 1, pitch: n.pitch, time: beat, duration: end - beat, velocity: n.velocity };
          out.push(left, right);
        } else {
          out.push(n);
        }
      }
      draftRef.current = out;
      draw();
      onChange?.(out.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
      e.preventDefault();
      return;
    }
    // Glue contiguous/overlapping selected notes by pitch
    if (e.key === "g" || e.key === "G") {
      const sel = new Set(selected);
      if (sel.size === 0) return;
      const byPitch = new Map<number, DraftNote[]>();
      const others: DraftNote[] = [];
      for (let i = 0; i < draftRef.current.length; i++) {
        const n = draftRef.current[i]!;
        if (sel.has(i)) {
          const arr = byPitch.get(n.pitch) ?? [];
          arr.push(n);
          byPitch.set(n.pitch, arr);
        } else {
          others.push(n);
        }
      }
      const merged: DraftNote[] = [];
      byPitch.forEach((arr) => {
        arr.sort((a, b) => a.time - b.time);
        let cur: DraftNote = { __id: Date.now(), pitch: arr[0]!.pitch, time: arr[0]!.time, duration: arr[0]!.duration, velocity: arr[0]!.velocity };
        for (let i = 1; i < arr.length; i++) {
          const n = arr[i]!;
          const curEnd = cur.time + cur.duration;
          if (n.time <= curEnd + 1e-6) {
            // overlap or contiguous
            const end = Math.max(curEnd, n.time + n.duration);
            cur = { ...cur, duration: end - cur.time };
          } else {
            merged.push(cur);
            cur = { __id: Date.now(), pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity };
          }
        }
        merged.push(cur);
      });
      const next = [...others, ...merged].sort((a, b) => a.time - b.time || a.pitch - b.pitch);
      draftRef.current = next;
      setSelected([]);
      draw();
      onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
      e.preventDefault();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
      const toDelete = new Set(selected);
      const next = draftRef.current.filter((_, i) => !toDelete.has(i));
      draftRef.current = next;
      setSelected([]);
      draw();
      onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
      e.preventDefault();
      return;
    }

    // Transpose selected notes (↑/↓ = semitone, Shift+↑/↓ = octave)
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && selected.length > 0) {
      const shift = e.shiftKey ? 12 : 1;
      const delta = e.key === "ArrowUp" ? shift : -shift;
      
      const sel = new Set(selected);
      const next = draftRef.current.map((n, i) => {
        if (!sel.has(i)) return n;
        const newPitch = Math.max(minPitch, Math.min(maxPitch, n.pitch + delta));
        return { ...n, pitch: newPitch };
      });
      
      draftRef.current = next;
      draw();
      onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
      e.preventDefault();
      return;
    }

    // Navigation: Home/End (clip bounds), Ctrl+Home/End (first/last note)
    if (e.key === "Home") {
      if (e.ctrlKey || e.metaKey) {
        // Jump to first note
        if (draftRef.current.length === 0) return;
        const firstNote = draftRef.current.reduce((min, n) => (n.time < min.time ? n : min));
        const targetX = timeToX(firstNote.time) - keyWidth;
        setScrollX(Math.max(0, targetX));
      } else {
        // Jump to clip start
        setScrollX(0);
      }
      e.preventDefault();
      return;
    }

    if (e.key === "End") {
      if (e.ctrlKey || e.metaKey) {
        // Jump to last note
        if (draftRef.current.length === 0) return;
        const lastNote = draftRef.current.reduce((max, n) => (n.time + n.duration > max.time + max.duration ? n : max));
        const targetX = timeToX(lastNote.time + lastNote.duration) - (wrapRef.current?.clientWidth ?? 800);
        setScrollX(Math.max(0, targetX));
      } else {
        // Jump to clip end
        const maxScroll = Math.max(0, totalPxX - ((wrapRef.current?.clientWidth ?? 800) - keyWidth));
        setScrollX(maxScroll);
      }
      e.preventDefault();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D") && selected.length === 1) {
      const src = draftRef.current[selected[0]!];
      if (!src) return;
      const newTime = snapBeat(src.time + src.duration);
      const dupe: DraftNote = { __id: Date.now(), pitch: src.pitch, time: newTime, duration: src.duration, velocity: src.velocity };
      const next = [...draftRef.current, dupe];
      draftRef.current = next;
      setSelected([next.length - 1]);
      draw();
      onChange?.(next.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity })));
      e.preventDefault();
      return;
    }
  };

  // WHEEL: scroll (Shift = horizontal)
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Prevent page scroll while interacting with the roll
    e.preventDefault();
    userScrolledRef.current = true;

    const deltaY = e.deltaY;
    const deltaX = e.deltaX;

    // Ctrl/Cmd + molette => zoom centré
    if (e.ctrlKey || e.metaKey) {
      const wrap = wrapRef.current;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        if (e.shiftKey) {
          // Vertical zoom centered at cursor pitch
          const yCss = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
          const pitchAtCursor = Math.ceil(yToPitch(yCss));
          const minPxY = 6;
          const maxPxY = 24;
          const scale = deltaY < 0 ? 1.1 : 1 / 1.1;
          const nextPxY = Math.max(minPxY, Math.min(maxPxY, pxPerSemitone * scale));
          setPxPerSemitone(nextPxY);
          const content = (maxPitch - minPitch + 1) * nextPxY;
          const viewport = viewportHeightCssRef.current ?? rect.height;
          const maxY = Math.max(0, content - viewport);
          // Keep pitch under cursor stable: y = (maxPitch - p) * px - scrollY
          const desiredScrollY = (maxPitch - pitchAtCursor) * nextPxY - yCss;
          const newScrollY = Math.min(maxY, Math.max(0, desiredScrollY));
          queueMicrotask(() => setScrollY(newScrollY));
        } else {
          // Horizontal zoom centered at cursor time
          const xCss = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const beatAtCursor = xToTime(xCss);
          const minPx = 16;
          const maxPx = 256;
          const scale = deltaY < 0 ? 1.1 : 1 / 1.1;
          const nextPx = Math.max(minPx, Math.min(maxPx, pxPerBeat * scale));
          // Adjust scrollX to keep the cursor time stable
          const newScrollX = Math.max(0, beatAtCursor * nextPx - (xCss - KEY_WIDTH));
          setPxPerBeat(nextPx);
          // defer scroll set to next microtask to use updated pxPerBeat in subsequent draws
          queueMicrotask(() => setScrollX(newScrollX));
        }
      }
      return;
    }

    if (e.shiftKey) {
      // Horizontal scroll when holding Shift or for trackpads
      setScrollX((prev) => {
        const maxX = Math.max(0, totalPxX - (wrapRef.current?.clientWidth ?? 0));
        const next = Math.min(maxX, Math.max(0, prev + deltaY + deltaX));
        return next;
      });
      return;
    }

    // Vertical scroll
    setScrollY((prev) => {
      const viewport = viewportHeightCssRef.current ?? 0;
      const content = (maxPitch - minPitch + 1) * pxPerSemitone;
      const maxY = Math.max(0, content - viewport);
      const next = Math.min(maxY, Math.max(0, prev + deltaY));
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Toolbar */}
      <PianoRollToolbar
        pxPerBeat={pxPerBeat}
        setPxPerBeat={setPxPerBeat}
        pxPerSemitone={pxPerSemitone}
        setPxPerSemitone={setPxPerSemitone}
        grid={grid}
        setGrid={setGrid}
        snap={snap}
        setSnap={setSnap}
        snapEdges={snapEdges}
        setSnapEdges={setSnapEdges}
        onQuantize={onQuantize}
      />

      {/* Viewport */}
      <NoteContextMenu
        hasSelection={selected.length > 0}
        onDelete={handleDeleteSelected}
        onDuplicate={handleDuplicateSelected}
        onTranspose={handleTransposeSelected}
        onQuantize={handleQuantizeSelected}
        onSetVelocity={handleSetVelocitySelected}
      >
        <div ref={wrapRef} onWheel={onWheel} onKeyDown={onKeyDown} tabIndex={0} className="relative h-[260px] min-h-[220px] w-full overflow-hidden rounded-sm border border-neutral-700 bg-neutral-900 focus:outline-none">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            onContextMenu={onContextMenu}
            onDoubleClick={onDoubleClick}
            className="block h-full w-full touch-none"
            style={{ cursor: cursor === "default" ? "default" : cursor === "pointer" ? "pointer" : "ew-resize" }}
          />
          <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          {perfStats && (
            <div className="absolute top-1 right-2 rounded bg-neutral-800/70 px-2 py-1 text-[10px] font-mono text-neutral-300 pointer-events-none">
              {perfStats.visible}/{perfStats.total} notes · {perfStats.avgMs.toFixed(1)} ms
            </div>
          )}
        </div>
      </NoteContextMenu>

      {/* Scrollbars */}
      <div className="flex items-center gap-2 text-[11px] text-neutral-300">
        <span className="text-neutral-400">Défilement</span>
        <input type="range" min={0} max={Math.max(0, totalPxX - 1)} step={1} value={scrollX} onChange={(e) => setScrollX(Number(e.target.value))} className="w-full" />
        <input
          type="range"
          min={0}
          max={(maxPitch - minPitch) * pxPerSemitone}
          step={1}
          value={scrollY}
          onChange={(e) => {
            userScrolledRef.current = true;
            setScrollY(Number(e.target.value));
          }}
        />
        {/* Loop controls (UI) */}
        <LoopControls
          grid={grid}
          lengthBeats={lengthBeats}
          current={loop ?? loopState}
          onSet={(next) => { setLoopState(next); onLoopChange?.(next); }}
          onDraw={draw}
          getNotes={() => draftRef.current.map((n) => ({ time: n.time, duration: n.duration }))}
          selected={selected}
        />
      </div>

      {/* Velocity Lane */}
      <VelocityLane
        draftRef={draftRef}
        selected={selected}
        setSelected={setSelected}
        pxPerBeat={pxPerBeat}
        grid={grid}
        keyWidth={keyWidth}
        scrollX={scrollX}
        timeToX={timeToX}
        onChange={onChange}
        onRequestRedraw={draw}
      />
    </div>
  );
});
