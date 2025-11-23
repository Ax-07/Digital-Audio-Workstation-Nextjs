// src/components/daw/controls/clip-editor/pianoroll/interactions/pointerMoveHandler.ts

import type { MouseEvent } from "react";
import { getHitAt } from "./hit";
import type {
  DragMode,
  CursorType,
  DraftNote,
  InteractionState,
} from "../types";
import type { RenderContext } from "../rendering/renderContext";
import type { GridValue } from "@/lib/audio/types";
import type { AudioEngine } from "@/lib/audio/core/audio-engine";
import { ensureMidiTrack } from "@/lib/audio/sources/midi-track";
import { NoteRef } from "../core/notesIndex";
import { changeKeyboardPreviewPitch, startKeyboardPreview } from "./keyboardPreview";

// ================= Grouped context type =================
export type PointerMoveHandlerCtx = {
  refs: {
    canvas: React.RefObject<HTMLCanvasElement | null>;
    draft: React.RefObject<DraftNote[]>;
    render: React.RefObject<RenderContext>;
    interaction: React.RefObject<InteractionState>;
    loopState: React.RefObject<{ start: number; end: number } | null>;
  };
  state: {
    dragMode: DragMode;
    selected: number[];
    loopState: { start: number; end: number } | null;
    loop: { start: number; end: number } | null;
    positionStart?: number;
  };
  geometry: {
    timeToX: (beat: number) => number;
    pitchToY: (pitch: number) => number;
    xToTime: (xCss: number) => number;
    yToPitch: (yCss: number) => number;
    pxPerBeat: number;
    pxPerSemitone: number;
    keyWidth: number;
    topBarHeight: number;
    minPitch: number;
    maxPitch: number;
  };
  clip: {
    grid: GridValue;
    lengthBeats: number;
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
    getNotesForPitch: (pitch: number) => NoteRef[] | undefined;
  };
  callbacks: {
    setSelected: (value: number[]) => void;
    setCursor: (cursor: CursorType) => void;
    setLoopState: (loop: { start: number; end: number } | null) => void;
    draw: () => void;
    emitDraftThrottled: () => void;
    emitLoopChangeThrottled: () => void;
    onPositionChange?: (beat: number) => void;
    onLengthChange?: (beats: number) => void;
  };
  external: {
    audio: AudioEngine;
  };
};

// Cache global du dernier DOMRect de canvas capturé au pointerDown.
// Mis à jour via setCanvasRectCache depuis pointerHandlers.
let _canvasRectCache: DOMRect | null = null;
export function setCanvasRectCache(rect: DOMRect) {
  _canvasRectCache = rect;
}

export function createPointerMoveHandlerCtx(ctx: PointerMoveHandlerCtx) {
  const {
    refs: { canvas, draft, render, interaction, loopState },
    state: { dragMode, selected, loopState: loopStateValue, loop, positionStart },
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
    helpers: { snapBeat, clampMoveAvoidOverlap, clampResizeAvoidOverlap, getNotesForPitch },
    callbacks: {
      setSelected,
      setCursor,
      setLoopState,
      draw,
      emitDraftThrottled,
      emitLoopChangeThrottled,
      onPositionChange,
      onLengthChange,
    },
    external: { audio },
  } = ctx;
  return (e: MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvas.current;
    if (!cvs) return;
    // Utilise le cache (précis capturé au pointerDown) et fallback périodique si absent ou invalide.
    let rect = _canvasRectCache;
    if (!rect) rect = cvs.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;

    const draftNotes = draft.current;
    const inter = interaction.current;
    const renderCtx = render.current;

    // =================== PAS DE DRAG : HOVER / GHOST / PREVIEW ===================
    if (!dragMode) {
      const hit = getHitAt(
        xCss,
        yCss,
        draftNotes,
        timeToX,
        pitchToY,
        (yLocal) => yToPitch(yLocal),
        pxPerSemitone,
        keyWidth,
        topBarHeight,
        loop ?? loopStateValue,
        positionStart,
        lengthBeats,
        (pitch) => getNotesForPitch(pitch) ?? [],
      );


      if (hit.type === "resize") {
        setCursor("ew-resize");
        if (typeof hit.noteIndex === "number") {
          inter.hoverNote = hit.noteIndex;
        }
      } else if (hit.type === "note") {
        setCursor("pointer");
        if (typeof hit.noteIndex === "number") {
          inter.hoverNote = hit.noteIndex;
        }
      } else if (
        hit.type === "loopStart" ||
        hit.type === "loopEnd" ||
        hit.type === "clipLength" ||
        hit.type === "positionStart"
      ) {
        setCursor("ew-resize");
      } else if (hit.type === "keyboard") {
        const nextPitch = yToPitch(yCss) ?? null;
        inter.hoverPitch = nextPitch;

        if (e.buttons === 1 && nextPitch != null) {
          const current = inter.pressedKey;
          if (current == null) {
            startKeyboardPreview(nextPitch, trackId, audio, interaction);
          } else if (current !== nextPitch) {
            changeKeyboardPreviewPitch(current, nextPitch, trackId, audio);
            inter.pressedKey = nextPitch;
          }
        }

        setCursor("default");
      } else if (hit.type === "loopBar") {
        const currentLoop = loop ?? loopStateValue;
        if (currentLoop) {
          const xStart = timeToX(currentLoop.start);
          const xEnd = timeToX(currentLoop.end);
          if (xCss >= xStart && xCss <= xEnd && yCss <= topBarHeight) {
            setCursor("pointer");
          } else {
            setCursor("crosshair");
          }
        } else {
          setCursor("crosshair");
        }
        inter.hoverNote = null;
        inter.hoverPitch = null;
        inter.ghost = null;
      } else {
        setCursor("crosshair");
        inter.hoverNote = null;
        inter.hoverPitch = null;
        const beat = xToTime(xCss);
        const pitch = yToPitch(yCss);
        inter.ghost =
          xCss >= keyWidth && yCss >= topBarHeight
            ? { time: snapBeat(beat), pitch }
            : null;
      }

      renderCtx.selected = inter.selected;
      renderCtx.selectedSet = new Set(inter.selected);
      renderCtx.draftNotes = draftNotes;
      draw();
      return;
    }

    // =================== DRAG MODES ===================

    // ------- MOVE -------
    if (
      dragMode === "move" &&
      inter.pointerStart &&
      typeof inter.pointerStart.noteIndex === "number"
    ) {
      const dx = xCss - inter.pointerStart.x;
      const dy = yCss - inter.pointerStart.y;
      const dBeat = dx / pxPerBeat;
      const dPitch = -Math.round(dy / pxPerSemitone);

      const selSet = new Set(selected);
      const prev = draftNotes;
      const next = inter.pointerStart.initial.slice();
      let anyChange = false;

      // Set d'exclusion partagé (toutes les notes sélectionnées)
      const baseExclude = new Set(selected);

      for (let i = 0; i < next.length; i++) {
        if (!selSet.has(i)) continue;
        const n = next[i]!;
        const rawTime = n.time + dBeat;
        const rawPitch = n.pitch + dPitch;

        const time = e.shiftKey ? rawTime : snapBeat(rawTime);
        const pitch = Math.max(minPitch, Math.min(maxPitch, rawPitch));

        // On évite de se collider soi-même : exclut temporairement i
        baseExclude.delete(i);
        const clampedTime = clampMoveAvoidOverlap(
          i,
          time,
          n.duration,
          pitch,
          baseExclude,
        );
        baseExclude.add(i);

        const updated = {
          ...n,
          time: Math.max(0, clampedTime),
          pitch,
        };

        if (!anyChange) {
          const p = prev[i];
          if (
            !p ||
            p.time !== updated.time ||
            p.pitch !== updated.pitch
          ) {
            anyChange = true;
          }
        }
        next[i] = updated;
      }

      if (!anyChange) return;

      draft.current = next;
      renderCtx.draftNotes = draft.current;
      renderCtx.selected = selected;
      renderCtx.selectedSet = new Set(selected);

      const primary =
        next[inter.pointerStart.noteIndex];
      if (primary) {
        inter.dragGuide = {
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

    // ------- RESIZE -------
    if (
      dragMode === "resize" &&
      inter.pointerStart &&
      typeof inter.pointerStart.noteIndex === "number"
    ) {
      const dx = xCss - inter.pointerStart.x;
      const dBeat = dx / pxPerBeat;

      const selSet = new Set(selected);
      const prev = draftNotes;
      const next = inter.pointerStart.initial.slice();
      let anyChange = false;

      const minDur = 1 / grid;
      const baseExclude = new Set(selected);

      for (let i = 0; i < next.length; i++) {
        if (!selSet.has(i)) continue;
        const n = next[i]!;
        const rawDur = n.duration + dBeat;
        const snappedDur = e.shiftKey ? rawDur : snapBeat(rawDur);

        baseExclude.delete(i);
        const clampedDur = clampResizeAvoidOverlap(
          i,
          n.time,
          snappedDur,
          n.pitch,
          baseExclude,
        );
        baseExclude.add(i);

        const updated = {
          ...n,
          duration: Math.max(minDur, clampedDur),
        };

        if (!anyChange) {
          const p = prev[i];
          if (!p || p.duration !== updated.duration) {
            anyChange = true;
          }
        }
        next[i] = updated;
      }

      if (!anyChange) return;

      draft.current = next;
      renderCtx.draftNotes = draft.current;
      renderCtx.selected = selected;
      renderCtx.selectedSet = new Set(selected);
      draw();
      emitDraftThrottled();
      return;
    }

    // ------- RECTANGLE SELECTION -------
    if (dragMode === "rectangleSelection" && inter.rectangleSelection) {
      inter.rectangleSelection.x1 = xCss;
      inter.rectangleSelection.y1 = yCss;

      const m = inter.rectangleSelection;
      const rx0 = Math.min(m.x0, m.x1);
      const rx1 = Math.max(m.x0, m.x1);
      const ry0 = Math.min(m.y0, m.y1);
      const ry1 = Math.max(m.y0, m.y1);

      const newSel: number[] = [];

      for (let i = 0; i < draftNotes.length; i++) {
        const n = draftNotes[i]!;
        const nx = timeToX(n.time);
        const ny = pitchToY(n.pitch);
        const nw = timeToX(n.time + n.duration) - nx;
        const nh = pxPerSemitone;

        if (
          nx + nw >= rx0 &&
          nx <= rx1 &&
          ny + nh >= ry0 &&
          ny <= ry1
        ) {
          newSel.push(i);
        }
      }

      inter.selected = newSel;
      renderCtx.selected = newSel;
      renderCtx.selectedSet = new Set(newSel);
      renderCtx.draftNotes = draftNotes;
      draw();
      return;
    }

    // ------- LOOP START/END -------
    if (
      (dragMode === "loopStart" || dragMode === "loopEnd") &&
      inter.loopDrag
    ) {
      const dx = xCss - inter.loopDrag.x0;
      const dBeat = dx / pxPerBeat;
      const step = 1 / grid;
      const { start, end } = inter.loopDrag.initial;

      if (inter.loopDrag.kind === "start") {
        let nextStart = e.shiftKey
          ? start + dBeat
          : snapBeat(start + dBeat);
        nextStart = Math.max(0, Math.min(nextStart, end - step));
        const nextLoop = { start: nextStart, end } as const;
        loopState.current = nextLoop;
        setLoopState(nextLoop);
        emitLoopChangeThrottled();
      } else {
        let nextEnd = e.shiftKey ? end + dBeat : snapBeat(end + dBeat);
        nextEnd = Math.min(
          lengthBeats,
          Math.max(start + step, nextEnd),
        );
        const nextLoop = { start, end: nextEnd } as const;
        loopState.current = nextLoop;
        setLoopState(nextLoop);
        emitLoopChangeThrottled();
      }

      renderCtx.loopState = loopState.current;
      draw();
      return;
    }

    // ------- LOOP MOVE -------
    if (dragMode === "loopMove" && inter.loopDrag) {
      const dx = xCss - inter.loopDrag.x0;
      const dBeat = dx / pxPerBeat;
      const { start, end } = inter.loopDrag.initial;
      const duration = Math.max(0, end - start);

      let nextStart = e.shiftKey
        ? start + dBeat
        : snapBeat(start + dBeat);
      nextStart = Math.max(
        0,
        Math.min(lengthBeats - duration, nextStart),
      );
      const nextEnd = nextStart + duration;

      const nextLoop = { start: nextStart, end: nextEnd } as const;
      loopState.current = nextLoop;
      setLoopState(nextLoop);
      emitLoopChangeThrottled();

      renderCtx.loopState = loopState.current;
      draw();
      return;
    }

    // ------- PLAYHEAD DRAG -------
    if (dragMode === "setPlayhead") {
      let next = xToTime(xCss);
      if (!e.shiftKey) next = snapBeat(next);
      next = Math.max(0, Math.min(lengthBeats, next));
      onPositionChange?.(next);

      renderCtx.draftNotes = draftNotes;
      renderCtx.selected = selected;
      renderCtx.selectedSet = new Set(selected);
      draw();
      return;
    }

    // ------- CLIP LENGTH DRAG -------
    if (
      dragMode === "resizeClip" &&
      inter.pointerStart?.initialLength != null
    ) {
      const initialLen = inter.pointerStart.initialLength;
      const dx = xCss - inter.pointerStart.x;
      const dBeat = dx / pxPerBeat;

      const step = 1 / grid;
      let nextLen = initialLen + dBeat;
      if (!e.shiftKey) {
        nextLen = Math.round(nextLen / step) * step;
      }
      nextLen = Math.max(step, nextLen);

      onLengthChange?.(nextLen);
      renderCtx.lengthBeats = nextLen;
      draw();
      return;
    }
  };
}
