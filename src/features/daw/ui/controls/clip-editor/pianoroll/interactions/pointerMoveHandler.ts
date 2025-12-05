// src/components/daw/controls/clip-editor/pianoroll/interactions/pointerMoveHandler.ts

import type { PointerEvent } from "react";
import { hitTest } from "./hit";
import type {
  DragMode,
  CursorType,
  DraftNote,
  InteractionState,
} from "../types";
import {
  commitRenderChangesAndDraw,
  type RenderContext,
} from "../rendering/renderContext";
import type { GridValue } from "@/lib/audio/types";
import type { AudioEngine } from "@/lib/audio/core/audio-engine";
import { NoteRef } from "../core/notesIndex";
import {
  changeKeyboardPreviewPitch,
  startKeyboardPreview,
} from "./keyboardPreview";

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

type PointerMoveRuntimeCtx = PointerMoveHandlerCtx & {
  e: PointerEvent<HTMLCanvasElement>;
  xCss: number;
  yCss: number;
  draftNotes: DraftNote[];
  renderCtx: RenderContext;
  inter: InteractionState;
};

type DragMoveHandler = (runtime: PointerMoveRuntimeCtx) => void;

// ================= HOVER / IDLE =================

function handleHover(runtime: PointerMoveRuntimeCtx) {
  const {
    e,
    xCss,
    yCss,
    draftNotes,
    renderCtx,
    inter,
    refs,
    state: { loopState: loopStateValue, loop, positionStart },
    geometry: {
      timeToX,
      pitchToY,
      xToTime,
      yToPitch,
      pxPerSemitone,
      keyWidth,
      topBarHeight,
    },
    clip: { lengthBeats, trackId },
    helpers: { snapBeat, getNotesForPitch },
    callbacks: { setCursor },
    external: { audio },
  } = runtime;

  const hit = hitTest({
    xCss,
    yCss,
    notes: draftNotes,
    timeToX,
    pitchToY,
    yToPitch: (yLocal) => yToPitch(yLocal),
    pxPerSemitone,
    keyWidth,
    topBarHeight,
    loop: loop ?? loopStateValue,
    positionStart,
    clipLength: lengthBeats,
    getNotesForPitch: (pitch) => getNotesForPitch(pitch) ?? [],
  });

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
        startKeyboardPreview(
          nextPitch,
          trackId,
          audio,
          refs.interaction,
        );
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

  // On rend en fonction de l’état d’interaction courant
  commitRenderChangesAndDraw(
    renderCtx,
    {
      draftNotes,
      selected: inter.selected,
      selectedSet: new Set(inter.selected),
    },
    runtime.callbacks.draw,
  );
}

// ================= DRAG HANDLERS =================

const handleDragMove: DragMoveHandler = (runtime) => {
  const {
    e,
    xCss,
    yCss,
    draftNotes,
    renderCtx,
    inter,
    state: { selected },
    geometry: {
      timeToX,
      pitchToY,
      pxPerBeat,
      pxPerSemitone,
      minPitch,
      maxPitch,
    },
    helpers: { snapBeat, clampMoveAvoidOverlap },
    callbacks: { emitDraftThrottled, draw },
    refs: { draft },
  } = runtime;

  if (!inter.pointerStart || typeof inter.pointerStart.noteIndex !== "number") {
    return;
  }

  const dx = xCss - inter.pointerStart.x;
  const dy = yCss - inter.pointerStart.y;
  const dBeat = dx / pxPerBeat;
  const dPitch = -Math.round(dy / pxPerSemitone);

  const selSet = new Set(selected);
  const prev = draftNotes;
  const next = inter.pointerStart.initial.slice();
  let anyChange = false;

  const baseExclude = new Set(selected);

  for (let i = 0; i < next.length; i++) {
    if (!selSet.has(i)) continue;
    const n = next[i]!;
    const rawTime = n.time + dBeat;
    const rawPitch = n.pitch + dPitch;

    const time = e.shiftKey ? rawTime : snapBeat(rawTime);
    const pitch = Math.max(minPitch, Math.min(maxPitch, rawPitch));

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
      if (!p || p.time !== updated.time || p.pitch !== updated.pitch) {
        anyChange = true;
      }
    }
    next[i] = updated;
  }

  if (!anyChange) return;

  draft.current = next;

  const primary = next[inter.pointerStart.noteIndex];
  if (primary) {
    inter.dragGuide = {
      xCss: timeToX(primary.time),
      yCss: pitchToY(primary.pitch),
      beat: primary.time,
      pitch: primary.pitch,
    };
  }

  commitRenderChangesAndDraw(
    renderCtx,
    {
      draftNotes: draft.current,
      selected,
      selectedSet: new Set(selected),
    },
    draw,
  );
  emitDraftThrottled();
};

const handleDragResize: DragMoveHandler = (runtime) => {
  const {
    e,
    xCss,
    draftNotes,
    renderCtx,
    inter,
    state: { selected },
    geometry: { pxPerBeat, pxPerSemitone },
    clip: { grid },
    helpers: { snapBeat, clampResizeAvoidOverlap },
    callbacks: { emitDraftThrottled, draw },
    refs: { draft },
  } = runtime;

  if (!inter.pointerStart || typeof inter.pointerStart.noteIndex !== "number") {
    return;
  }

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

  commitRenderChangesAndDraw(
    renderCtx,
    {
      draftNotes: draft.current,
      selected,
      selectedSet: new Set(selected),
    },
    draw,
  );
  emitDraftThrottled();
};

const handleRectangleSelection: DragMoveHandler = (runtime) => {
  const {
    xCss,
    yCss,
    draftNotes,
    renderCtx,
    inter,
    geometry: { timeToX, pitchToY, pxPerSemitone },
    callbacks: { draw },
  } = runtime;

  if (!inter.rectangleSelection) return;

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

  commitRenderChangesAndDraw(
    renderCtx,
    {
      draftNotes,
      selected: newSel,
      selectedSet: new Set(newSel),
    },
    draw,
  );
};

const handleLoopEdgeDrag: DragMoveHandler = (runtime) => {
  const {
    e,
    xCss,
    renderCtx,
    inter,
    clip: { grid, lengthBeats },
    callbacks: { setLoopState, emitLoopChangeThrottled, draw },
    refs: { loopState },
  } = runtime;

  if (!inter.loopDrag) return;

  const dx = xCss - inter.loopDrag.x0;
  const dBeat = dx / runtime.geometry.pxPerBeat;
  const step = 1 / grid;
  const { start, end } = inter.loopDrag.initial;

  if (inter.loopDrag.kind === "start") {
    let nextStart = e.shiftKey ? start + dBeat : runtime.helpers.snapBeat(start + dBeat);
    nextStart = Math.max(0, Math.min(nextStart, end - step));
    const nextLoop = { start: nextStart, end } as const;
    loopState.current = nextLoop;
    setLoopState(nextLoop);
    emitLoopChangeThrottled();
  } else {
    let nextEnd = e.shiftKey ? end + dBeat : runtime.helpers.snapBeat(end + dBeat);
    nextEnd = Math.min(lengthBeats, Math.max(start + step, nextEnd));
    const nextLoop = { start, end: nextEnd } as const;
    loopState.current = nextLoop;
    setLoopState(nextLoop);
    emitLoopChangeThrottled();
  }

  commitRenderChangesAndDraw(
    renderCtx,
    {
      loopState: loopState.current,
    },
    draw,
  );
};

const handleLoopMove: DragMoveHandler = (runtime) => {
  const {
    e,
    xCss,
    renderCtx,
    inter,
    clip: { lengthBeats },
    callbacks: { setLoopState, emitLoopChangeThrottled, draw },
    refs: { loopState },
    helpers: { snapBeat },
    geometry: { pxPerBeat },
  } = runtime;

  if (!inter.loopDrag) return;

  const dx = xCss - inter.loopDrag.x0;
  const dBeat = dx / pxPerBeat;
  const { start, end } = inter.loopDrag.initial;
  const duration = Math.max(0, end - start);

  let nextStart = e.shiftKey ? start + dBeat : snapBeat(start + dBeat);
  nextStart = Math.max(0, Math.min(lengthBeats - duration, nextStart));
  const nextEnd = nextStart + duration;

  const nextLoop = { start: nextStart, end: nextEnd } as const;
  loopState.current = nextLoop;
  setLoopState(nextLoop);
  emitLoopChangeThrottled();

  commitRenderChangesAndDraw(
    renderCtx,
    {
      loopState: loopState.current,
    },
    draw,
  );
};

const handlePlayheadDrag: DragMoveHandler = (runtime) => {
  const {
    e,
    xCss,
    renderCtx,
    inter,
    clip: { lengthBeats },
    callbacks: { onPositionChange, draw },
    geometry: { xToTime },
    refs: { draft },
    state: { selected },
  } = runtime;

  let next = xToTime(xCss);
  if (!e.shiftKey) next = runtime.helpers.snapBeat(next);
  next = Math.max(0, Math.min(lengthBeats, next));
  onPositionChange?.(next);

  commitRenderChangesAndDraw(
    renderCtx,
    {
      draftNotes: draft.current,
      selected,
      selectedSet: new Set(selected),
    },
    draw,
  );
};

const handleClipResize: DragMoveHandler = (runtime) => {
  const {
    e,
    xCss,
    renderCtx,
    inter,
    clip: { grid },
    callbacks: { onLengthChange, draw },
    geometry: { pxPerBeat },
  } = runtime;

  if (!inter.pointerStart?.initialLength) return;

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

  commitRenderChangesAndDraw(
    renderCtx,
    {
      lengthBeats: nextLen,
    },
    draw,
  );
};

const dragMoveHandlers: Partial<Record<Exclude<DragMode, null>, DragMoveHandler>> = {
  move: handleDragMove,
  resize: handleDragResize,
  rectangleSelection: handleRectangleSelection,
  loopStart: handleLoopEdgeDrag,
  loopEnd: handleLoopEdgeDrag,
  loopMove: handleLoopMove,
  setPlayhead: handlePlayheadDrag,
  resizeClip: handleClipResize,
};

// ================= FACTORY =================

export function createPointerMoveHandlerCtx(ctx: PointerMoveHandlerCtx) {
  return (e: PointerEvent<HTMLCanvasElement>) => {
    const cvs = ctx.refs.canvas.current;
    if (!cvs) return;

    const inter = ctx.refs.interaction.current;

    // Rect par instance (pas global)
    let rect = inter.canvasRectCache;
    if (!rect) {
      rect = cvs.getBoundingClientRect();
      inter.canvasRectCache = rect;
    }

    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;

    const draftNotes = ctx.refs.draft.current;
    const renderCtx = ctx.refs.render.current;

    const runtime: PointerMoveRuntimeCtx = {
      ...ctx,
      e,
      xCss,
      yCss,
      draftNotes,
      renderCtx,
      inter,
    };

    const { dragMode } = ctx.state;

    // === Pas de drag : état "hover" / preview / ghost
    if (!dragMode) {
      handleHover(runtime);
      return;
    }

    // === Drag en cours : on délègue au handler approprié
    const handler = dragMoveHandlers[dragMode];
    if (handler) {
      handler(runtime);
    }
  };
}
