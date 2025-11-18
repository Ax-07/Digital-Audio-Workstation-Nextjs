// src/components/daw/controls/clip-editor/pianoroll/types.ts

import type { MidiNote } from "@/lib/audio/types";

export type DraftNote = MidiNote & { __id: number };

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

  // Contrôles optionnels (controlled/uncontrolled)
  grid?: 4 | 8 | 16 | 32;
  onGridChange?: (next: 4 | 8 | 16 | 32) => void;
  snap?: boolean;
  onSnapChange?: (next: boolean) => void;
  pxPerBeat?: number; // 16–192 recommandé
  onPxPerBeatChange?: (next: number) => void;
};

export type DragMode = null | "move" | "resize" | "rectangleSelection" | "loopStart" | "loopEnd" | "loopMove";

export type CursorType = "default" | "pointer" | "ew-resize" | "crosshair";

export type PointerStartState = {
  x: number;
  y: number;
  noteIndex: number | null;
  initial: DraftNote[];
  loopStart?: number;
  loopEnd?: number;
} | null;

export type RectangleSelectionState = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} | null;

export type DragGuideState = {
  xCss: number;
  yCss: number;
  beat: number;
  pitch: number;
} | null;

export type LoopDragState = {
  kind: "start" | "end" | "move";
  x0: number;
  initial: { start: number; end: number };
} | null;

export type PerfStats = {
  lastDrawMs: number;
  avgMs: number;
  samples: number;
  visible: number;
  total: number;
  lastUpdate: number;
};
